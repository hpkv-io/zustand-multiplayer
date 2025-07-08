import { produce } from 'immer';
import type { Draft } from 'immer';
import { StateCreator, StoreMutatorIdentifier, StoreApi } from 'zustand/vanilla';
import { ConnectionState } from '@hpkv/websocket-client';
import { createHPKVStorage, HPKVStorageOptions } from './storage/hpkv-storage';
import { createLogger, LogLevel, Logger } from './monitoring/logger';
import { createDefaultRetryConfig } from './network/retry';
import { MultiplayerOrchestrator } from './core/multiplayer-orchestrator';
import { extractPaths, shouldStoreGranularly } from './utils/state-utils';
import { 
  type MultiplayerOptions, 
  type MultiplayerState, 
  type ImmerStateCreator,
  type PathExtractable,
  MultiplayerError,
  ConfigurationError
} from './types/multiplayer-types';

import { 
  MULTIPLAYER_FIELD, 
  ARROW_FUNCTION_INDICATOR, 
  PATH_SEPARATOR 
} from './utils/constants';

// ============================================================================
// TYPES
// ============================================================================

type Multiplayer = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  U = T & { multiplayer: MultiplayerState<T> },
>(
  initializer: ImmerStateCreator<T, [...Mps, ['zustand/multiplayer', unknown]], Mcs, T>,
  options: MultiplayerOptions<T>,
) => StateCreator<U, Mps, [['zustand/multiplayer', U], ...Mcs]>;

type MultiplayerMiddleware = <TState>(
  config: ImmerStateCreator<TState, [], [], TState>,
  options: MultiplayerOptions<TState>,
) => StateCreator<TState & { multiplayer: MultiplayerState<TState> }, [], []>;

type StateUpdateFunction<TState> = (state: TState) => TState | Partial<TState>;
type StateUpdateImmerFunction<TState> = (state: Draft<TState>) => void;
type StateUpdatePartial<TState> = TState | Partial<TState>;
type StateUpdateWithChanges<TState> = { changes: Partial<TState>; deletions: Array<{ path: string[] }> };

type StateUpdateInput<TState> = 
  | StateUpdatePartial<TState>
  | StateUpdateFunction<TState>
  | StateUpdateImmerFunction<TState>
  | StateUpdateWithChanges<TState>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates that required authentication options are provided
 */
function validateAuthenticationOptions<TState>(options: MultiplayerOptions<TState>): void {
  if (!options.apiKey && !options.tokenGenerationUrl) {
    throw new ConfigurationError(
      'Either apiKey or tokenGenerationUrl must be provided for authentication',
      {
        apiKey: options.apiKey,
        tokenGenerationUrl: options.tokenGenerationUrl,
        operation: 'authentication-validation'
      }
    );
  }
}

/**
 * Determines if a function is an arrow function by checking its string representation
 */
function isArrowFunction(func: Function): boolean {
  return func.toString().includes(ARROW_FUNCTION_INDICATOR);
}

/**
 * Detects changes between old and new state
 */
function detectStateChanges<TState>(oldState: TState, newState: TState): Partial<TState> {
  const changes: Partial<TState> = {};
  
  for (const key in newState) {
    if (newState[key] !== oldState[key]) {
      changes[key] = newState[key];
    }
  }
  
  return changes;
}

/**
 * Calculates deletions for granular state storage
 */
function calculateStateDeletions<TState>(
  changes: Partial<TState>, 
  oldState: TState
): Array<{ path: string[] }> {
  const deletions: Array<{ path: string[] }> = [];
  
  for (const [field, newValue] of Object.entries(changes)) {
    if (field === MULTIPLAYER_FIELD || typeof newValue === 'function') {
      continue;
    }
    
    if (shouldStoreGranularly(newValue)) {
      const oldFieldValue = (oldState as Record<string, unknown>)[field];
      
      if (shouldStoreGranularly(oldFieldValue)) {
        const deletedPaths = findDeletedPaths(oldFieldValue, newValue, field);
        deletions.push(...deletedPaths);
      }
    }
  }
  
  return deletions;
}

/**
 * Finds paths that have been deleted between old and new values
 */
function findDeletedPaths(
  oldValue: Record<string, unknown>, 
  newValue: Record<string, unknown>, 
  fieldName: string
): Array<{ path: string[] }> {
  const oldPaths = extractPaths({ [fieldName]: oldValue } as PathExtractable);
  const newPaths = extractPaths({ [fieldName]: newValue } as PathExtractable);

  const oldPathSet = new Set(oldPaths.map(p => p.path.join(PATH_SEPARATOR)));
  const newPathSet = new Set(newPaths.map(p => p.path.join(PATH_SEPARATOR)));
  
  const deletedPaths = Array.from(oldPathSet).filter(path => {
    if (newPathSet.has(path)) {
      return false;
    }

    // Check if this path is a parent of any new path
    const pathPrefix = path + PATH_SEPARATOR;
    return !Array.from(newPathSet).some(newPath => newPath.startsWith(pathPrefix));
  });
  
  return deletedPaths.map(deletedPath => ({
    path: deletedPath.split(PATH_SEPARATOR)
  }));
}

/**
 * Processes Immer function updates
 */
function processImmerFunctionUpdate<TState>(
  func: StateUpdateImmerFunction<TState>,
  getCurrentState: () => TState,
  orchestrator: MultiplayerOrchestrator<TState>,
  replace?: boolean
): void {
  const oldState = getCurrentState();
  const newState = produce(oldState, func);
  
  const changes = detectStateChanges(oldState, newState);
  const deletions = calculateStateDeletions(changes, oldState);
  
  orchestrator.handleStateChangeRequest({ changes, deletions }, replace);
}

/**
 * Creates default sync options with fallbacks
 */
function createDefaultSyncOptions<TState>(
  options: MultiplayerOptions<TState>,
  nonFunctionKeys: Array<keyof TState>
): MultiplayerOptions<TState> {
  return {
    subscribeToUpdatesFor: () => nonFunctionKeys,
    publishUpdatesFor: () => nonFunctionKeys,
    onConflict: conflicts => {
      // Default conflict resolution strategy - will be logged by the conflict resolver
      return { strategy: 'keep-remote' };
    },
    logLevel: LogLevel.INFO,
    retryConfig: createDefaultRetryConfig(),
    profiling: false,
    ...options,
  };
}

/**
 * Creates path patterns for subscription
 */
function createPathPatterns(subscribedFields: Array<keyof any>): string[] {
  const pathPatterns = new Set<string>();
  
  subscribedFields.forEach(key => {
    const keyStr = String(key);
    pathPatterns.add(keyStr);
    pathPatterns.add(`${keyStr}:*`);
  });
  
  return Array.from(pathPatterns);
}

/**
 * Extracts non-function keys from initial state
 */
function extractNonFunctionKeys<TState>(initialState: Record<string, unknown>): Array<keyof TState> {
  return Object.keys(initialState).filter(
    key => typeof initialState[key] !== 'function',
  ) as Array<keyof TState>;
}

/**
 * Sets up window cleanup handlers and returns a cleanup function
 */
function setupWindowCleanup(orchestrator: MultiplayerOrchestrator<any>): () => void {
  if (typeof window !== 'undefined') {
    const cleanup = () => orchestrator.destroy();
    window.addEventListener('beforeunload', cleanup);
    
    // Return a function to remove the event listener
    return () => {
      window.removeEventListener('beforeunload', cleanup);
    };
  }
  
  // Return a no-op function for non-browser environments
  return () => {};
}

/**
 * Performs async initialization of the orchestrator
 */
async function initializeOrchestrator<TState>(
  orchestrator: MultiplayerOrchestrator<TState>,
  logger: Logger
): Promise<void> {
  try {
    await orchestrator.connect();
    await orchestrator.hydrate();
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    logger.error(
      'Store initialization failed',
      normalizedError,
      { operation: 'store-initialization' }
    );
    // Error is logged but doesn't prevent store creation
  }
}

// ============================================================================
// MAIN IMPLEMENTATION
// ============================================================================

const impl: MultiplayerMiddleware = (config, options) => (_set, get, api) => {
  validateAuthenticationOptions(options);

  type TState = ReturnType<typeof config>;
  type TStateWithMultiplayer = TState & { multiplayer: MultiplayerState<TState> };

  const originalSetState = api.setState;
  let orchestrator: MultiplayerOrchestrator<TState>;

  /**
   * Enhanced setState function with multiplayer synchronization
   */
  const multiplayerSetState = <A extends StateUpdateInput<TState>>(
    partial: A,
    replace?: boolean,
  ) => {
    if (typeof partial === 'function') {
      const func = partial as Function;
      
      if (isArrowFunction(func)) {
        processImmerFunctionUpdate(
          partial as StateUpdateImmerFunction<TState>,
          () => get() as TState,
          orchestrator,
          replace
        );
      } else {
        orchestrator.handleStateChangeRequest(
          partial as StateUpdateFunction<TState>, 
          replace
        );
      }
    } else {
      orchestrator.handleStateChangeRequest(
        partial as StateUpdatePartial<TState> | StateUpdateWithChanges<TState>, 
        replace
      );
    }
  };

  // Override the API's setState
  api.setState = multiplayerSetState;

  // Create extended API for the config function
  const extendedApi = {
    setState: multiplayerSetState,
    getState: () => get() as TState,
    subscribe: api.subscribe,
  };

  // Initialize the store
  const store = config(multiplayerSetState, () => get() as TState, extendedApi);

  // Extract configuration from initial state
  const initialState = (get() || store) as Record<string, unknown>;
  const nonFunctionKeys = extractNonFunctionKeys<TState>(initialState);
  const syncOptions = createDefaultSyncOptions(options, nonFunctionKeys);
  const logger = createLogger(syncOptions.logLevel ?? LogLevel.INFO);

  // Setup subscription patterns
  const subscribedFields = syncOptions.subscribeToUpdatesFor!();
  const subscribedKeysArray = createPathPatterns(subscribedFields);
  const publishedKeysArray = syncOptions.publishUpdatesFor!().map(key => String(key));

  // Create storage client
  const hpkvStorageOptions: HPKVStorageOptions = {
    namespace: syncOptions.namespace,
    apiBaseUrl: syncOptions.apiBaseUrl,
    apiKey: syncOptions.apiKey,
    tokenGenerationUrl: syncOptions.tokenGenerationUrl,
    clientConfig: syncOptions.clientConfig,
    retryConfig: syncOptions.retryConfig,
  };

  const client = createHPKVStorage(
    hpkvStorageOptions,
    subscribedKeysArray,
    publishedKeysArray,
    logger,
  );

  // Initialize orchestrator
  const orchestratorApi = {
    ...api,
    setState: originalSetState,
  };

  orchestrator = new MultiplayerOrchestrator(
    client, 
    syncOptions, 
    orchestratorApi as StoreApi<TState>, 
    store
  );

  // Create multiplayer state interface
  const multiplayerState: MultiplayerState<TState> = {
    connectionState: ConnectionState.DISCONNECTED,
    hasHydrated: false,
    hydrate: () => orchestrator.hydrate(),
    clearStorage: () => orchestrator.clearStorage(),
    disconnect: () => orchestrator.disconnect(),
    connect: () => orchestrator.connect(),
    destroy: () => orchestrator.destroy(),
    getConnectionStatus: () => orchestrator.getConnectionStatus(),
    getMetrics: () => orchestrator.getMetrics(),
  };

  // Combine store with multiplayer state
  const storeWithMultiplayer = {
    ...store,
    multiplayer: {
      ...multiplayerState,
      connectionState: client?.getConnectionStatus()?.connectionState ?? ConnectionState.DISCONNECTED,
      hasHydrated: false,
    },
  } as TStateWithMultiplayer;

  // Setup async initialization and cleanup
  initializeOrchestrator(orchestrator, logger);
  const windowCleanup = setupWindowCleanup(orchestrator);
  
  // Store the cleanup function for proper resource management
  // Note: In a real implementation, this should be stored somewhere accessible
  // for manual cleanup if needed before page unload

  return storeWithMultiplayer;
};

export const multiplayer = impl as unknown as Multiplayer;
