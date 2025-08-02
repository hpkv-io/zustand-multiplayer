import { ConnectionState } from '@hpkv/websocket-client';
import type { StateCreator, StoreMutatorIdentifier, StoreApi } from 'zustand/vanilla';
import { MultiplayerOrchestrator } from './core/multiplayer-orchestrator';
import { ServiceFactory } from './core/service-factory';
import { detectStateChanges, detectStateDeletions } from './core/state-manager';
import type { Logger } from './monitoring/logger';
import { createLogger, LogLevel } from './monitoring/logger';
import type { RetryConfig } from './network/retry';
import { createDefaultRetryConfig } from './network/retry';
import type { HPKVStorageOptions } from './storage/hpkv-storage';
import { createHPKVStorage } from './storage/hpkv-storage';
import {
  type WithMultiplayer,
  type MultiplayerOptions,
  type MultiplayerState,
  type PathExtractable,
  MultiplayerError,
  ErrorSeverity,
  ErrorCategory,
} from './types/multiplayer-types';
import { validateOptions } from './utils/config-validator';
import { DEFAULT_Z_FACTOR, MAX_Z_FACTOR, MIN_Z_FACTOR } from './utils/constants';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Main multiplayer middleware type
 */
type Multiplayer = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<
    T,
    [...Mps, ['zustand/multiplayer', never]],
    Mcs,
    Omit<T, 'multiplayer'>
  >,
  options: MultiplayerOptions<Omit<T, 'multiplayer'>>,
) => StateCreator<T, Mps, [['zustand/multiplayer', never], ...Mcs], WithMultiplayer<T>>;

/**
 * Internal implementation type
 */
type MultiplayerImpl = <T extends { multiplayer: MultiplayerState }>(
  stateCreator: StateCreator<T, [], []>,
  options: MultiplayerOptions<T>,
) => StateCreator<WithMultiplayer<T>, [], []>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates normalized options with safe defaults
 */
function normalizeOptions<T>(
  options: MultiplayerOptions<T>,
  nonFunctionKeys: Array<keyof T>,
): MultiplayerOptions<T> & {
  subscribeToUpdatesFor: () => Array<keyof T>;
  publishUpdatesFor: () => Array<keyof T>;
  logLevel: LogLevel;
  retryConfig: RetryConfig;
  profiling: boolean;
  zFactor: number;
} {
  const zFactor = Math.min(
    Math.max(MIN_Z_FACTOR, options.zFactor ?? DEFAULT_Z_FACTOR),
    MAX_Z_FACTOR,
  );

  return {
    subscribeToUpdatesFor: () => nonFunctionKeys,
    publishUpdatesFor: () => nonFunctionKeys,
    onConflict: () => ({ strategy: 'keep-remote' }),
    logLevel: LogLevel.INFO,
    retryConfig: createDefaultRetryConfig(),
    profiling: false,
    ...options,
    zFactor,
  };
}

/**
 * Creates path patterns for subscription
 */
function createPathPatterns<T>(subscribedFields: Array<keyof T>): string[] {
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
function extractNonFunctionKeys<T>(initialState: Record<string, unknown>): Array<keyof T> {
  return Object.keys(initialState).filter(key => typeof initialState[key] !== 'function') as Array<
    keyof T
  >;
}

/**
 * Sets up window cleanup handlers and returns a cleanup function
 */
function setupWindowCleanup<T>(orchestrator: MultiplayerOrchestrator<T>): () => void {
  if (typeof window !== 'undefined') {
    const cleanup = () => {
      void orchestrator.destroy();
    };
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
async function initializeOrchestrator<T>(
  orchestrator: MultiplayerOrchestrator<T>,
  logger: Logger,
): Promise<void> {
  try {
    await orchestrator.connect();
    await orchestrator.hydrate();
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const initializationError = new MultiplayerError(
      'Store initialization failed',
      'INITIALIZATION_ERROR',
      true,
      {
        operation: 'store-initialization',
        originalError: normalizedError.message,
      },
      ErrorSeverity.HIGH,
      ErrorCategory.STATE_MANAGEMENT,
    );
    logger.error('Store initialization failed', initializationError, {
      operation: 'store-initialization',
    });
  }
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Internal implementation with full Immer support
 */
const multiplayerImpl: MultiplayerImpl = (config, options) => {
  type T = ReturnType<typeof config>;

  const validatedOptions = validateOptions(options);

  return (set, get, api) => {
    const originalSet = set;
    // eslint-disable-next-line prefer-const
    let orchestrator: MultiplayerOrchestrator<T>;

    /**
     * Multiplayer setState wrapper for synchronization
     */
    const multiplayerSet: typeof set = (partial, replace) => {
      if (typeof partial === 'function') {
        const currentState = get();
        const nextState = partial(currentState);

        const changes = detectStateChanges(currentState, nextState);
        const deletions = detectStateDeletions(
          currentState as unknown as PathExtractable,
          nextState as PathExtractable,
          normalizedOptions.zFactor,
        );

        orchestrator.handleStateChangeRequest({ changes, deletions }, replace);
      } else {
        orchestrator.handleStateChangeRequest(partial, replace);
      }
    };

    api.setState = multiplayerSet;

    const baseState = config(multiplayerSet, get, api);
    const initialState = baseState as Record<string, unknown>;
    const nonFunctionKeys = extractNonFunctionKeys<T>(initialState);
    const normalizedOptions = normalizeOptions(validatedOptions, nonFunctionKeys);
    const logger = createLogger(normalizedOptions.logLevel);
    const subscribedFields = normalizedOptions.subscribeToUpdatesFor();
    const subscribedKeysArray = createPathPatterns(subscribedFields);
    const publishedKeysArray = normalizedOptions.publishUpdatesFor().map(key => String(key));

    const hpkvStorageOptions: HPKVStorageOptions = {
      namespace: normalizedOptions.namespace,
      apiBaseUrl: normalizedOptions.apiBaseUrl,
      apiKey: normalizedOptions.apiKey,
      tokenGenerationUrl: normalizedOptions.tokenGenerationUrl,
      clientConfig: normalizedOptions.clientConfig,
      retryConfig: normalizedOptions.retryConfig,
      zFactor: normalizedOptions.zFactor,
    };

    const client = createHPKVStorage(
      hpkvStorageOptions,
      subscribedKeysArray,
      publishedKeysArray,
      logger,
    );

    const originalApi: StoreApi<T> = {
      ...api,
      setState: originalSet,
    };

    const services = ServiceFactory.createOrchestratorServices(client, normalizedOptions);

    orchestrator = new MultiplayerOrchestrator(
      client,
      normalizedOptions,
      originalApi,
      baseState,
      services,
    );

    const multiplayerState: MultiplayerState = {
      connectionState:
        client?.getConnectionStatus()?.connectionState ?? ConnectionState.DISCONNECTED,
      hasHydrated: false,
      hydrate: () => orchestrator.hydrate(),
      clearStorage: () => orchestrator.clearStorage(),
      disconnect: () => orchestrator.disconnect(),
      connect: () => orchestrator.connect(),
      destroy: () => orchestrator.destroy(),
      getConnectionStatus: () => orchestrator.getConnectionStatus(),
      getMetrics: () => orchestrator.getMetrics(),
    };

    void initializeOrchestrator(orchestrator, logger);
    setupWindowCleanup(orchestrator);

    return {
      ...baseState,
      multiplayer: multiplayerState,
    };
  };
};

export const multiplayer = multiplayerImpl as unknown as Multiplayer;
