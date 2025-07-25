import { ConnectionState } from '@hpkv/websocket-client';
import { produce } from 'immer';
import type { Draft } from 'immer';
import { StateCreator, StoreMutatorIdentifier, StoreApi } from 'zustand/vanilla';
import { MultiplayerOrchestrator } from './core/multiplayer-orchestrator';
import { createLogger, LogLevel, Logger } from './monitoring/logger';
import { createDefaultRetryConfig } from './network/retry';
import { createHPKVStorage, HPKVStorageOptions } from './storage/hpkv-storage';
import {
  type MultiplayerOptions,
  type MultiplayerState,
  type ImmerStateCreator,
  type PathExtractable,
  ConfigurationError,
} from './types/multiplayer-types';
import { ARROW_FUNCTION_INDICATOR } from './utils/constants';
import { detectStateDeletions, detectStateChanges } from './utils/state-utils';

// ============================================================================
// TYPES
// ============================================================================

type Multiplayer = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  U = T & { multiplayer: MultiplayerState },
>(
  initializer: ImmerStateCreator<T, [...Mps, ['zustand/multiplayer', unknown]], Mcs, T>,
  options: MultiplayerOptions<T>,
) => StateCreator<U, Mps, [['zustand/multiplayer', U], ...Mcs]>;

type MultiplayerMiddleware = <TState>(
  config: ImmerStateCreator<TState, [], [], TState>,
  options: MultiplayerOptions<TState>,
) => StateCreator<TState & { multiplayer: MultiplayerState }, [], []>;

type StateUpdateFunction<TState> = (state: TState) => TState | Partial<TState>;
type StateUpdateImmerFunction<TState> = (state: Draft<TState>) => void;
type StateUpdatePartial<TState> = TState | Partial<TState>;
type StateUpdateWithChanges<TState> = {
  changes: Partial<TState>;
  deletions: Array<{ path: string[] }>;
};

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
        operation: 'authentication-validation',
      },
    );
  }
}

/**
 * Determines if a function is an arrow function by checking its string representation
 */
function isArrowFunction(func: (...args: any[]) => any): boolean {
  return func.toString().includes(ARROW_FUNCTION_INDICATOR);
}

/**
 * Processes Immer function updates
 */
function processImmerFunctionUpdate<TState>(
  func: StateUpdateImmerFunction<TState>,
  getCurrentState: () => TState,
  orchestrator: MultiplayerOrchestrator<TState>,
  replace?: boolean,
  zFactor: number = 2,
): void {
  const oldState = getCurrentState();
  const newState = produce(oldState, func);

  const changes = detectStateChanges(oldState, newState);
  const deletions = detectStateDeletions(
    oldState as PathExtractable,
    newState as PathExtractable,
    zFactor,
  );

  orchestrator.handleStateChangeRequest({ changes, deletions }, replace);
}

/**
 * Creates default sync options with fallbacks
 */
function createDefaultSyncOptions<TState>(
  options: MultiplayerOptions<TState>,
  nonFunctionKeys: Array<keyof TState>,
): MultiplayerOptions<TState> {
  const zFactor = options.zFactor !== undefined ? Math.min(Math.max(0, options.zFactor), 10) : 2;

  return {
    subscribeToUpdatesFor: () => nonFunctionKeys,
    publishUpdatesFor: () => nonFunctionKeys,
    onConflict: _conflicts => {
      return { strategy: 'keep-remote' };
    },
    logLevel: LogLevel.INFO,
    retryConfig: createDefaultRetryConfig(),
    profiling: false,
    ...options,
    zFactor: zFactor,
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
function extractNonFunctionKeys<TState>(
  initialState: Record<string, unknown>,
): Array<keyof TState> {
  return Object.keys(initialState).filter(key => typeof initialState[key] !== 'function') as Array<
    keyof TState
  >;
}

/**
 * Sets up window cleanup handlers and returns a cleanup function
 */
function setupWindowCleanup(orchestrator: MultiplayerOrchestrator<any>): () => void {
  if (typeof window !== 'undefined') {
    const cleanup = () => orchestrator.destroy();
    window.addEventListener('beforeunload', cleanup);

    return () => {
      window.removeEventListener('beforeunload', cleanup);
    };
  }

  return () => {};
}

/**
 * Performs async initialization of the orchestrator
 */
async function initializeOrchestrator<TState>(
  orchestrator: MultiplayerOrchestrator<TState>,
  logger: Logger,
): Promise<void> {
  try {
    await orchestrator.connect();
    await orchestrator.hydrate();
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    logger.error('Store initialization failed', normalizedError, {
      operation: 'store-initialization',
    });
  }
}

// ============================================================================
// MAIN IMPLEMENTATION
// ============================================================================

const impl: MultiplayerMiddleware = (config, options) => (_set, get, api) => {
  validateAuthenticationOptions(options);

  type TState = ReturnType<typeof config>;
  type TStateWithMultiplayer = TState & { multiplayer: MultiplayerState };

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
      const func = partial as StateUpdateFunction<TState> | StateUpdateImmerFunction<TState>;

      if (isArrowFunction(func)) {
        processImmerFunctionUpdate(
          partial as StateUpdateImmerFunction<TState>,
          () => get() as TState,
          orchestrator,
          replace,
          syncOptions.zFactor ?? 2,
        );
      } else {
        orchestrator.handleStateChangeRequest(partial as StateUpdateFunction<TState>, replace);
      }
    } else {
      orchestrator.handleStateChangeRequest(
        partial as StateUpdatePartial<TState> | StateUpdateWithChanges<TState>,
        replace,
      );
    }
  };

  api.setState = multiplayerSetState;

  const extendedApi = {
    setState: multiplayerSetState,
    getState: () => get() as TState,
    subscribe: api.subscribe,
  };

  // Initialize the store
  const store = config(multiplayerSetState, () => get() as TState, extendedApi);

  const initialState = (get() || store) as Record<string, unknown>;
  const nonFunctionKeys = extractNonFunctionKeys<TState>(initialState);
  const syncOptions = createDefaultSyncOptions(options, nonFunctionKeys);
  const logger = createLogger(syncOptions.logLevel ?? LogLevel.INFO);

  const subscribedFields = syncOptions.subscribeToUpdatesFor!();
  const subscribedKeysArray = createPathPatterns(subscribedFields);
  const publishedKeysArray = syncOptions.publishUpdatesFor!().map(key => String(key));

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

  const apiWithOriginalSetState = {
    ...api,
    setState: originalSetState,
  };

  orchestrator = new MultiplayerOrchestrator(
    client,
    syncOptions,
    apiWithOriginalSetState as StoreApi<TState>,
    store,
  );

  const multiplayerState: MultiplayerState = {
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

  const storeWithMultiplayer = {
    ...store,
    multiplayer: {
      ...multiplayerState,
      connectionState:
        client?.getConnectionStatus()?.connectionState ?? ConnectionState.DISCONNECTED,
      hasHydrated: false,
    },
  } as TStateWithMultiplayer;

  initializeOrchestrator(orchestrator, logger);
  setupWindowCleanup(orchestrator);

  return storeWithMultiplayer;
};

export const multiplayer = impl as unknown as Multiplayer;
