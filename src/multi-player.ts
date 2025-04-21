// Import the logger

import {
  ConnectionError,
  HPKVClientFactory,
  HPKVError,
  HPKVSubscriptionClient,
} from '@hpkv/websocket-client';
import type { StateCreator, StoreApi } from 'zustand';
import { type PersistStorage, type StateStorage } from 'zustand/middleware';
import { logger } from './logger';

/**
 * HPKV storage options for the multiplayer middleware
 */
export interface HPKVStorageOptions {
  /**
   * URL to generate HPKV subscription token
   * This endpoint should accept store name and return a token
   */
  tokenGenerationUrl: string;

  /** HPKV API base URL */
  apiBaseUrl: string;

  /** Enable debug logging */
  debug?: boolean;

  /** Maximum number of retries for operations */
  maxRetries?: number;

  /** Delay between retries in milliseconds */
  retryDelay?: number;
}

// Client cache to avoid creating multiple clients for the same store
const clientCache = new Map<string, HPKVSubscriptionClient>();
// Promise cache to avoid multiple simultaneous client creation attempts
const clientPromiseCache = new Map<string, Promise<HPKVSubscriptionClient>>();
// Token promise cache to avoid multiple simultaneous token requests
const tokenPromiseCache = new Map<string, Promise<string>>();

/**
 * Debug logging utility that only logs when debug is enabled
 */
function debugLog(debug: boolean, ...args: string[]) {
  if (debug) {
    logger.log('[zustand multiplayer middleware]', ...args);
  }
}

/**
 * Throttle function to limit the frequency of calls
 */
function throttle<T extends (...args: Parameters<T>) => Promise<ReturnType<T> | void>>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => Promise<ReturnType<T> | void> {
  let lastCall = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastPromise: Promise<ReturnType<T> | void> | null = null;

  return (...args: Parameters<T>): Promise<ReturnType<T> | void> => {
    const now = Date.now();

    // If called within the delay period, postpone the call
    if (now - lastCall < delay) {
      if (timeout) {
        clearTimeout(timeout);
      }

      return new Promise(resolve => {
        timeout = setTimeout(
          () => {
            lastCall = Date.now();
            timeout = null;
            resolve(func(...args));
          },
          delay - (now - lastCall),
        );
      });
    }

    // Otherwise, execute immediately
    lastCall = now;
    lastPromise = Promise.resolve(func(...args));
    return lastPromise;
  };
}

/**
 * Fetches a token from the token generation URL
 */
async function getToken(
  url: string,
  storeName: string,
  options: RetryOptions = { retries: 1, retryDelay: 100 },
): Promise<string> {
  const tokenCacheKey = `${url}:${storeName}`;

  // Check if there's already a pending token request
  const pendingTokenPromise = tokenPromiseCache.get(tokenCacheKey);
  if (pendingTokenPromise) {
    return pendingTokenPromise;
  }

  const tokenPromise = retryOperation(async () => {
    try {
      // Fetch token from the token generation URL
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ storeName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.token || data;
    } catch (error) {
      logger.error('Failed to get token:', error);
      throw error;
    }
  }, options);

  // Store the token promise in cache
  tokenPromiseCache.set(tokenCacheKey, tokenPromise);

  // Clean up the promise cache after resolution
  tokenPromise.finally(() => {
    if (tokenPromiseCache.get(tokenCacheKey) === tokenPromise) {
      tokenPromiseCache.delete(tokenCacheKey);
    }
  });

  return tokenPromise;
}

interface RetryOptions {
  retries: number;
  retryDelay: number;
}

/**
 * Utility to retry async operations
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = { retries: 1, retryDelay: 100 },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < options.retries) {
        await new Promise(resolve => setTimeout(resolve, options.retryDelay));
      }
    }
  }

  throw lastError;
}

/**
 * Interface for storage value structure
 */
export type StorageValue<S> = {
  state: S;
  version?: number;
};

/**
 * Creates a StateStorage implementation backed by HPKV
 */
export function createHPKVStorage(
  options: HPKVStorageOptions,
  storeName: string,
  rehydrateCallback?: () => void,
): StateStorage {
  const cacheKey = `${options.tokenGenerationUrl}:${storeName}:${options.apiBaseUrl}`;
  let client: HPKVSubscriptionClient | null = null;
  let hasSubscribed = false;
  let tokenRetryAttempt = 0;
  const debug = !!options.debug;

  /**
   * Gets or creates a client with token from the token generation URL
   */
  async function getOrCreateClient(): Promise<HPKVSubscriptionClient> {
    try {
      // Check cache first
      const cachedClient = clientCache.get(cacheKey);
      if (cachedClient && cachedClient.getConnectionStats().isConnected) {
        client = cachedClient;
        return cachedClient;
      }

      // Check if there's already a pending promise for this client
      const pendingPromise = clientPromiseCache.get(cacheKey);
      if (pendingPromise) {
        return pendingPromise;
      }

      // Create a new promise for client creation
      const clientPromise = (async () => {
        // Fetch token
        const token = await getToken(options.tokenGenerationUrl, storeName, {
          retries: options.maxRetries || 3,
          retryDelay: options.retryDelay || 100,
        });

        // Create a new client
        client = HPKVClientFactory.createSubscriptionClient(token, options.apiBaseUrl);

        // Store in cache
        clientCache.set(cacheKey, client);
        client.on('connected', () => {
          debugLog(debug, 'Successfully connected to HPKV WebSocket');
        });
        await client.connect();

        if (rehydrateCallback && !hasSubscribed) {
          // Subscribe to changes in the store
          client.subscribe(() => {
            debugLog(debug, 'Received update for store', storeName);
            rehydrateCallback();
          });
          hasSubscribed = true;
        }

        // Reset token retry counter on successful connection
        tokenRetryAttempt = 0;

        return client;
      })();

      // Store the promise in the cache
      clientPromiseCache.set(cacheKey, clientPromise);

      // Clean up promise cache after resolution (success or failure)
      clientPromise.finally(() => {
        if (clientPromiseCache.get(cacheKey) === clientPromise) {
          clientPromiseCache.delete(cacheKey);
        }
      });

      return clientPromise;
    } catch (error) {
      logger.error('Connection error:', error);

      // If this might be a token expiration issue and we haven't retried yet
      if (tokenRetryAttempt < 1) {
        tokenRetryAttempt++;
        clientCache.delete(cacheKey);
        clientPromiseCache.delete(cacheKey);
        return getOrCreateClient();
      }

      clientCache.delete(cacheKey);
      clientPromiseCache.delete(cacheKey);
      throw error;
    }
  }

  const stateStorage: StateStorage = {
    getItem: async name => {
      try {
        return await retryOperation(
          async () => {
            const currentClient = await getOrCreateClient();
            const response = await currentClient.get(name);

            if (!response || !response.value) {
              return null;
            }

            // Ensure we're returning a properly formatted JSON string
            try {
              // The response.value should be an object that we want to stringify
              if (typeof response.value === 'string') {
                return response.value;
              } else {
                return JSON.stringify(response.value);
              }
            } catch (error) {
              logger.error('Error processing response:', error);
              return null;
            }
          },
          {
            retries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 100,
          },
        );
      } catch (error: unknown) {
        if (error instanceof HPKVError && 'code' in error && error.code === 404) {
          return null;
        }
        if (
          error instanceof ConnectionError &&
          error.message &&
          error.message.includes('destroyed')
        ) {
          return null;
        }
        logger.error('Failed to get item:', error);
        return null;
      }
    },

    setItem: async (name, value) => {
      try {
        await retryOperation(
          async () => {
            const currentClient = await getOrCreateClient();

            // Check if we're reconnecting after a disconnection
            const connectionStats = currentClient.getConnectionStats();
            const wasDisconnected = !connectionStats.isConnected;

            // If we're potentially reconnecting after a disconnection, get the latest state first
            if (wasDisconnected) {
              debugLog(debug, 'Reconnecting after disconnection, fetching latest state first');

              try {
                // Get the latest state from the server
                const latestResponse = await currentClient.get(name);

                if (latestResponse && latestResponse.value) {
                  let parsedLatestValue;
                  let parsedCurrentValue;

                  try {
                    // Parse both the latest server state and the current value we're trying to set
                    if (typeof latestResponse.value === 'string') {
                      parsedLatestValue = JSON.parse(latestResponse.value);
                    } else {
                      parsedLatestValue = latestResponse.value;
                    }

                    parsedCurrentValue = JSON.parse(value);

                    // Merge the states - keep the server's state as base and apply our local changes
                    if (parsedLatestValue && parsedLatestValue.state && parsedCurrentValue.state) {
                      // Deep merge the states, with local state taking precedence
                      parsedCurrentValue.state = {
                        ...parsedLatestValue.state,
                        ...parsedCurrentValue.state,
                      };

                      // Update the value to be set with the merged state
                      value = JSON.stringify(parsedCurrentValue);
                      debugLog(debug, 'Successfully merged server state with local changes');
                    }
                  } catch (parseError) {
                    logger.error('Error merging states after reconnection:', parseError);
                    // Continue with original value if parsing failed
                  }
                }
              } catch (fetchError) {
                logger.warn('Failed to fetch latest state during reconnection:', fetchError);
                // Continue with original value if fetch failed
              }
            }

            let parsedValue;
            try {
              parsedValue = JSON.parse(value);
            } catch (error) {
              logger.error('Failed to parse value for storage:', error);
              return;
            }

            await currentClient.set(name, parsedValue, true);
          },
          {
            retries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 100,
          },
        );
      } catch (error) {
        logger.error('Failed to set item:', error);
      }
    },

    removeItem: async name => {
      try {
        await retryOperation(
          async () => {
            const currentClient = await getOrCreateClient();
            await currentClient.delete(name);
          },
          {
            retries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 100,
          },
        );
      } catch (error: unknown) {
        if (error instanceof HPKVError && 'code' in error && error.code === 404) {
          return;
        }
        logger.error('Failed to remove item:', error);
      }
    },
  };

  return stateStorage;
}

/**
 * API for the multiplayer middleware
 */
export interface MultiplayerApi<S> {
  setOptions: (options: Partial<MultiplayerOptions<S>>) => void;
  clearStorage: () => Promise<void>;
  rehydrate: () => Promise<void> | void;
  hasHydrated: () => boolean;
  onHydrate: (fn: MultiplayerListener<S>) => () => void;
  onFinishHydration: (fn: MultiplayerListener<S>) => () => void;
  getOptions: () => Partial<MultiplayerOptions<S>>;
  isConnected: () => boolean;
  disconnect: () => Promise<void>;
}

/**
 * Options for the multiplayer middleware
 */
export interface MultiplayerOptions<S> {
  /** Name of the storage (must be unique) */
  name: string;

  /**
   * URL to generate HPKV subscription token
   * This endpoint should accept store name and return a token
   */
  tokenGenerationUrl: string;

  /**
   * HPKV API base URL for using HPKV as storage.
   */
  apiBaseUrl: string;

  /**
   * Filter the persisted value.
   *
   * @params state The state's value
   */
  partialize?: (state: S) => Partial<S> | any;

  /**
   * A function returning another (optional) function.
   * The main function will be called before the state rehydration.
   * The returned function will be called after the state rehydration or when an error occurred.
   */
  onRehydrateStorage?: (state: S) => ((state?: S, error?: unknown) => void) | void;

  /**
   * If the stored state's version mismatch the one specified here, the storage will not be used.
   * This is useful when adding a breaking change to your store.
   */
  version?: number;

  /**
   * A function to perform persisted state migration.
   * This function will be called when persisted state versions mismatch with the one specified here.
   */
  migrate?: (persistedState: unknown, version: number) => S | Promise<S>;

  /**
   * A function to perform custom hydration merges when combining the stored state with the current one.
   * By default, this function does a shallow merge.
   */
  merge?: (persistedState: unknown, currentState: S) => S;

  /**
   * An optional boolean that will prevent the multiplayer middleware from triggering hydration on initialization,
   * This allows you to call `rehydrate()` at a specific point in your apps rendering life-cycle.
   *
   * This is useful in SSR application.
   *
   * @default false
   */
  skipHydration?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Throttle delay for state updates in milliseconds
   * @default 100
   */
  throttleDelay?: number;

  /**
   * Maximum number of retries for state operations
   * @default 3
   */
  maxRetries?: number;

  /**
   * Delay between retries in milliseconds
   * @default 100
   */
  retryDelay?: number;
}

type MultiplayerListener<S> = (state: S) => void;

/**
 * Add multiplayer capabilities to the state type
 */
export type StateWithMultiplayer<T> = T & {
  multiplayer: MultiplayerApi<T>;
};

/**
 * Store type with multiplayer API
 */
export type StoreWithMultiplayer<T> = StoreApi<StateWithMultiplayer<T>>;

/**
 * Implementation of the multiplayer middleware
 */
function multiplayerImpl<T>(
  config: StateCreator<T, [], []>,
  baseOptions: MultiplayerOptions<T>,
): StateCreator<StateWithMultiplayer<T>, [], []> {
  return (set, get, api) => {
    // Initialize options with defaults
    let options: MultiplayerOptions<T> = {
      partialize: (state: T) => state,
      version: 0,
      merge: (persistedState: unknown, currentState: T) => ({
        ...currentState,
        ...(persistedState as object),
      }),
      debug: false,
      throttleDelay: 100,
      maxRetries: 3,
      retryDelay: 100,
      ...baseOptions,
    };

    const debug = !!options.debug;

    // Check for required options
    if (!options.name || !options.tokenGenerationUrl || !options.apiBaseUrl) {
      logger.error(
        'Required options missing: name, tokenGenerationUrl, and apiBaseUrl are required',
      );

      // Initialize with base config and empty multiplayer API
      const initialState = config(set, get, api);
      return {
        ...initialState,
        multiplayer: {
          setOptions: () => {},
          clearStorage: async () => {},
          rehydrate: () => {},
          hasHydrated: () => false,
          onHydrate: () => () => {},
          onFinishHydration: () => () => {},
          getOptions: () => options,
          isConnected: () => false,
          disconnect: async () => {},
        },
      } as StateWithMultiplayer<T>;
    }

    // Set up HPKV storage
    const hpkvStorage = createHPKVStorage(
      {
        tokenGenerationUrl: options.tokenGenerationUrl,
        apiBaseUrl: options.apiBaseUrl,
        debug: options.debug,
        maxRetries: options.maxRetries,
        retryDelay: options.retryDelay,
      },
      options.name,
      () => hydrate(),
    );

    const storage: PersistStorage<T> = {
      getItem: async name => {
        const value = await hpkvStorage.getItem(name);
        if (!value) return null;

        const parsed = JSON.parse(value) as StorageValue<T>;
        return parsed;
      },
      setItem: async (name: string, value: StorageValue<T>) => {
        const jsonValue = JSON.stringify(value);
        await hpkvStorage.setItem(name, jsonValue);
      },
      removeItem: async (name: string) => {
        await hpkvStorage.removeItem(name);
      },
    };

    let hasHydrated = false;
    const hydrationListeners = new Set<MultiplayerListener<T>>();
    const finishHydrationListeners = new Set<MultiplayerListener<T>>();

    // Create the multiplayer API
    const multiplayerApi: MultiplayerApi<T> = {
      setOptions: newOptions => {
        options = {
          ...options,
          ...newOptions,
        };
      },
      clearStorage: async () => {
        await storage.removeItem(options.name);
      },
      getOptions: () => options,
      rehydrate: () => hydrate(),
      hasHydrated: () => hasHydrated,
      onHydrate: cb => {
        hydrationListeners.add(cb);
        return () => {
          hydrationListeners.delete(cb);
        };
      },
      onFinishHydration: cb => {
        finishHydrationListeners.add(cb);
        return () => {
          finishHydrationListeners.delete(cb);
        };
      },
      isConnected: () => {
        const cacheKey = `${options.tokenGenerationUrl}:${options.name}:${options.apiBaseUrl}`;
        const client = clientCache.get(cacheKey);
        return client?.getConnectionStats().isConnected ?? false;
      },
      disconnect: async () => {
        const cacheKey = `${options.tokenGenerationUrl}:${options.name}:${options.apiBaseUrl}`;
        const client = clientCache.get(cacheKey);

        if (client) {
          await client.disconnect(false);
          await new Promise(resolve => setTimeout(resolve, 200));
          client.destroy();
          clientCache.delete(cacheKey);
        }
      },
    };

    // Function to save state to storage with throttling
    const saveState = async (state: StateWithMultiplayer<T>) => {
      try {
        // Get state without multiplayer API
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { multiplayer, ...baseState } = state;
        const partializedState = options.partialize
          ? options.partialize(baseState as T)
          : (baseState as T);
        await storage.setItem(options.name, {
          state: partializedState,
          version: options.version,
        });
      } catch (error) {
        logger.error('Failed to persist state:', error);
      }
    };

    // Create throttled version of saveState
    const throttledSaveState = throttle(saveState, options.throttleDelay || 100);

    // Create a new set function that incorporates the multiplayer API
    const multiplayerSet: typeof set = (
      stateOrFn: Parameters<typeof set>[0],
      replace?: boolean,
    ) => {
      if (typeof stateOrFn === 'function') {
        if (replace === true) {
          set(state => {
            const result = stateOrFn(state);
            return {
              ...result,
              multiplayer: multiplayerApi,
            };
          }, true);
        } else {
          set(state => {
            const result = stateOrFn(state);
            return {
              ...result,
              multiplayer: multiplayerApi,
            };
          });
        }
      } else {
        if (replace === true) {
          set(
            {
              ...stateOrFn,
              multiplayer: multiplayerApi,
            },
            true,
          );
        } else {
          set({
            ...stateOrFn,
            multiplayer: multiplayerApi,
          });
        }
      }

      // Save state to storage
      throttledSaveState(get());
    };

    // Create initial state
    const initialState = config(multiplayerSet, get, api);

    // Save the original setState
    const savedSetState = api.setState;

    // Override setState to ensure multiplayer API is included
    // Using Zustand's exact typing pattern with type assertion
    type TState = StateWithMultiplayer<T>;
    const setState = (
      partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>),
      replace?: boolean,
    ) => {
      savedSetState(
        partial as StateWithMultiplayer<T> | Partial<StateWithMultiplayer<T>>,

        replace as any,
      );
      void throttledSaveState(get());
    };
    api.setState = setState as typeof api.setState;

    // Add getInitialState to API
    // Following Zustand's internal pattern
    const getInitialState = () => initialState;
    Object.defineProperty(api, 'getInitialState', {
      value: getInitialState,
    });

    // Define rehydration function
    const hydrate = async () => {
      hasHydrated = false;

      const state = get();
      hydrationListeners.forEach(cb => cb(state));
      const postRehydrationCallback = options.onRehydrateStorage?.(state);

      try {
        // Get state from storage
        const deserializedStorageValue = await storage.getItem(options.name);

        let migratedState: T | undefined;
        let migrated = false;

        if (deserializedStorageValue) {
          if (
            typeof deserializedStorageValue.version === 'number' &&
            deserializedStorageValue.version !== options.version
          ) {
            if (options.migrate) {
              try {
                debugLog(
                  debug,
                  `Migrating state from version ${deserializedStorageValue.version} to ${options.version}`,
                );
                const result = options.migrate(
                  deserializedStorageValue.state,
                  deserializedStorageValue.version,
                );

                migratedState = result instanceof Promise ? await result : result;
                debugLog(debug, 'State migration completed successfully');
                migrated = true;
              } catch (migrationError) {
                logger.error('Migration failed:', migrationError);
                postRehydrationCallback?.(undefined, migrationError);
                return;
              }
            } else {
              logger.error(
                "State loaded from storage couldn't be migrated since no migrate function was provided",
              );
            }
          } else {
            migratedState = deserializedStorageValue.state as T;
            debugLog(debug, 'Retrieved state from storage (no migration needed)');
          }
        } else {
          debugLog(debug, 'No state found in storage');
        }

        if (migratedState) {
          try {
            const currentState = get();
            debugLog(debug, 'Merging state with current state');
            const mergedState = options.merge
              ? options.merge(migratedState, currentState)
              : migratedState;

            // Set the state without triggering storage save
            set(
              {
                ...mergedState,
                multiplayer: multiplayerApi,
              },
              true,
            );

            if (migrated) {
              debugLog(debug, 'Saving migrated state to storage');
              saveState(get());
            }
          } catch (mergeError) {
            logger.error('Error merging state:', mergeError);
            postRehydrationCallback?.(undefined, mergeError);
            return;
          }
        } else {
          debugLog(debug, 'No state to apply from storage');
        }

        // Call post-hydration callback
        postRehydrationCallback?.(get(), undefined);
        hasHydrated = true;
        finishHydrationListeners.forEach(cb => cb(get()));
      } catch (error) {
        logger.error('Error during hydration:', error);
        postRehydrationCallback?.(undefined, error);
      }
    };

    // Hydrate state if not skipped
    if (!options.skipHydration) {
      void hydrate();
    }

    // Return state with multiplayer API
    return {
      ...initialState,
      multiplayer: multiplayerApi,
    } as StateWithMultiplayer<T>;
  };
}

/**
 * Multiplayer middleware for Zustand
 *
 * Enables real-time state synchronization between multiple clients using HPKV
 *
 * @example
 * ```ts
 * const useStore = create<StateWithMultiplayer<MyStateType>>(
 *   multiplayer(
 *     (set) => ({
 *       count: 0,
 *       increment: () => set((state) => ({ count: state.count + 1 })),
 *     }),
 *     {
 *       name: 'my-store',
 *       tokenGenerationUrl: 'https://my-api.com/token',
 *       apiBaseUrl: 'https://hpkv.my-api.com',
 *       debug: false,
 *       throttleDelay: 100,
 *       maxRetries: 3,
 *       retryDelay: 100
 *     }
 *   )
 * );
 *
 * // Usage:
 * const { count, multiplayer } = useStore();
 * const { disconnect, isConnected, hasHydrated } = multiplayer;
 * ```
 */
export function multiplayer<T>(
  config: StateCreator<T, [], []>,
  options: MultiplayerOptions<T>,
): StateCreator<StateWithMultiplayer<T>, [], []> {
  return multiplayerImpl(config, options);
}
