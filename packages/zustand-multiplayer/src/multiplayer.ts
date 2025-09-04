import { ConnectionState } from '@hpkv/websocket-client';
import type { StateCreator, StoreMutatorIdentifier, StoreApi } from 'zustand/vanilla';
import { Orchestrator } from './core/orchestrator';
import { createLogger, LogLevel } from './monitoring/logger';
import { PerformanceMonitor } from './monitoring/profiler';
import type { HPKVStorageOptions } from './storage/hpkv-storage';
import { HPKVStorage } from './storage/hpkv-storage';
import type {
  MultiplayerStoreApi,
  WithMultiplayer,
  MultiplayerOptions,
  MultiplayerState,
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
  initializer: StateCreator<T, [...Mps, ['zustand/multiplayer', never]], Mcs, T>,
  options: MultiplayerOptions<T>,
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
  sync: Array<keyof T>;
  logLevel: LogLevel;
  zFactor: number;
} {
  const zFactor = Math.min(
    Math.max(MIN_Z_FACTOR, options.zFactor ?? DEFAULT_Z_FACTOR),
    MAX_Z_FACTOR,
  );

  return {
    sync: options.sync ?? nonFunctionKeys,
    logLevel: LogLevel.INFO,
    ...options,
    zFactor,
  };
}

/**
 * Creates path patterns for subscription
 */
function createPathPatterns<T>(syncFields: Array<keyof T>): string[] {
  const pathPatterns = new Set<string>();

  syncFields.forEach(key => {
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
 * Performs async initialization of the orchestrator
 */
async function initializeOrchestrator<T>(
  orchestrator: Orchestrator<T>,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  try {
    await orchestrator.connect();
    await orchestrator.hydrate();
    logger.info('Multiplayer store initialized successfully', {
      operation: 'store-initialization',
    });
  } catch (error) {
    logger.error('Store initialization failed', error as Error, {
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

    let orchestrator: Orchestrator<T>;

    /**
     * Multiplayer setState wrapper for synchronization
     */
    const multiplayerSet: typeof set = (partial, replace) => {
      void orchestrator.handleLocalStateChange(partial, replace);
    };

    (api as StoreApi<T> & MultiplayerStoreApi<T>).multiplayer = {
      reHydrate: () => orchestrator.hydrate(),
      clearStorage: () => orchestrator.clearStorage(),
      disconnect: () => orchestrator.disconnect(),
      connect: () => orchestrator.connect(),
      destroy: () => orchestrator.destroy(),
      getConnectionStatus: () => orchestrator.getConnectionStatus(),
      getMetrics: () => orchestrator.getMetrics(),
    };

    api.setState = multiplayerSet;

    const baseState = config(multiplayerSet, get, api);
    const initialState = baseState as Record<string, unknown>;
    const nonFunctionKeys = extractNonFunctionKeys<T>(initialState);
    const normalizedOptions = normalizeOptions(validatedOptions, nonFunctionKeys);
    const logger = createLogger(normalizedOptions.logLevel);
    const syncFields = normalizedOptions.sync;
    const subscribedKeysArray = createPathPatterns(syncFields);

    const hpkvStorageOptions: HPKVStorageOptions = {
      namespace: normalizedOptions.namespace,
      apiBaseUrl: normalizedOptions.apiBaseUrl,
      apiKey: normalizedOptions.apiKey,
      tokenGenerationUrl: normalizedOptions.tokenGenerationUrl,
      rateLimit: normalizedOptions.rateLimit,
      zFactor: normalizedOptions.zFactor,
    };

    const performanceMonitor = new PerformanceMonitor();
    const client = new HPKVStorage(
      hpkvStorageOptions,
      subscribedKeysArray,
      logger,
      performanceMonitor,
    );

    orchestrator = new Orchestrator(
      client,
      normalizedOptions,
      { ...api, setState: originalSet },
      performanceMonitor,
      logger,
    );

    const multiplayerState: MultiplayerState = {
      connectionState:
        client?.getConnectionStatus()?.connectionState ?? ConnectionState.DISCONNECTED,
      hasHydrated: false,
      performanceMetrics: orchestrator.getMetrics(),
    };

    void initializeOrchestrator(orchestrator, logger);

    return {
      ...baseState,
      multiplayer: multiplayerState,
    };
  };
};

export const multiplayer = multiplayerImpl as unknown as Multiplayer;
