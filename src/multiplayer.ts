import { ConnectionConfig, ConnectionState, ConnectionStats } from '@hpkv/websocket-client';
import { StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand/vanilla';
import {
  ConflictInfo,
  ConflictResolution,
  ConflictResolver,
  StateChange,
} from './conflictResolver';
import { createHPKVStorage, HPKVChangeEvent, HPKVStorage, HPKVStorageOptions } from './hpkvStorage';
import { Logger, LogLevel, createLogger } from './logger';
import { PerformanceMonitor, PerformanceMetrics } from './profiler';
import { RetryConfig, createDefaultRetryConfig } from './retry';

// ============================================================================
// Types
// ============================================================================

export interface MultiplayerOptions<TState> {
  namespace: string;
  apiBaseUrl: string;
  apiKey?: string;
  tokenGenerationUrl?: string;
  publishUpdatesFor?: () => Array<keyof TState>;
  subscribeToUpdatesFor?: () => Array<keyof TState>;
  onHydrate?: (state: TState) => void;
  onConflict?: (conflicts: ConflictInfo<TState>[]) => ConflictResolution<TState>;
  logLevel?: LogLevel;
  profiling?: boolean;
  retryConfig?: RetryConfig;
  clientConfig?: ConnectionConfig;
}

export type Write<T, U> = Omit<T, keyof U> & U;

export type WithMultiplayerMiddleware<S, _A> = Write<S, { multiplayer: MultiplayerState }>;

export type WithMultiplayer<S> = S & { multiplayer: MultiplayerState };

export interface MultiplayerState {
  connectionState: ConnectionState;
  hasHydrated: boolean;
  hydrate: () => Promise<void>;
  clearStorage: () => Promise<void>;
  disconnect: () => Promise<void>;
  connect: () => Promise<void>;
  destroy: () => Promise<void>;
  getConnectionStatus: () => ConnectionStats | null;
  getMetrics: () => PerformanceMetrics;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class MultiplayerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MultiplayerError';
  }
}

export class HydrationError extends MultiplayerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'HYDRATION_ERROR', true, context);
  }
}

// ============================================================================
// STORAGE MANAGER
// ============================================================================

class StorageManager {
  private connectionListeners: Array<(state: ConnectionState) => void> = [];
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private client: HPKVStorage,
    private logger: Logger,
  ) {
    this.setupConnectionListener();
  }

  private setupConnectionListener(): void {
    this.client.addConnectionListener((state: ConnectionState) => {
      this.logger.info(`Connection state changed to ${state}`, { operation: 'connection' });

      if (state === ConnectionState.CONNECTED) {
        this.clearReconnectTimeout();
      }

      this.connectionListeners.forEach(listener => {
        try {
          listener(state);
        } catch (error) {
          this.logger.error(
            'Error in connection listener',
            error instanceof Error ? error : new Error(String(error)),
            { operation: 'connection' },
          );
        }
      });
    });
  }

  addConnectionListener(listener: (state: ConnectionState) => void): () => void {
    this.connectionListeners.push(listener);

    return () => {
      const index = this.connectionListeners.indexOf(listener);
      if (index > -1) {
        this.connectionListeners.splice(index, 1);
      }
    };
  }

  async connect(): Promise<void> {
    await this.client.ensureConnection();
  }

  async disconnect(): Promise<void> {
    this.clearReconnectTimeout();
    await this.client.close();
  }

  getConnectionState(): ConnectionState {
    return this.client.getConnectionStatus()?.connectionState ?? ConnectionState.DISCONNECTED;
  }

  getConnectionStats(): ConnectionStats | null {
    return this.client.getConnectionStatus();
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  cleanup(): void {
    this.clearReconnectTimeout();
    this.connectionListeners.length = 0;
  }
}

// ============================================================================
// STATE HYDRATOR
// ============================================================================

class StateHydrator<TState> {
  private isHydrating = false;
  private hydrationPromise: Promise<void> | null = null;
  private hasHydrated = false;

  constructor(
    private client: HPKVStorage,
    private logger: Logger,
    private performanceMonitor: PerformanceMonitor,
  ) {}

  async hydrate(
    applyStateChange: (
      partial: Partial<TState>,
      replace?: boolean,
      isRemote?: boolean,
    ) => Promise<void>,
    onHydrate?: (state: TState) => void,
  ): Promise<void> {
    if (this.isHydrating && this.hydrationPromise) {
      return this.hydrationPromise;
    }

    if (this.isHydrating) {
      return;
    }

    this.logger.info('Starting hydration', { operation: 'hydration' });
    this.isHydrating = true;

    const startTime = Date.now();
    this.hydrationPromise = this.performHydration(applyStateChange, onHydrate, startTime);

    try {
      await this.hydrationPromise;
    } finally {
      this.isHydrating = false;
      this.hydrationPromise = null;
    }
  }

  private async performHydration(
    applyStateChange: (
      partial: Partial<TState>,
      replace?: boolean,
      isRemote?: boolean,
    ) => Promise<void>,
    onHydrate?: (state: TState) => void,
    startTime?: number,
  ): Promise<void> {
    try {
      const state = await this.client.getAllItems();

      const stateObject = Object.fromEntries(state.entries()) as TState;
      try {
        onHydrate?.(stateObject);
      } catch (error) {
        this.logger.error(
          'Error in onHydrate callback',
          error instanceof Error ? error : new Error(String(error)),
          { operation: 'hydration' },
        );
      }

      const applyPromises: Promise<void>[] = [];

      for (const [key, value] of state.entries()) {
        if (this.shouldSkipField(key, value)) {
          continue;
        }

        applyPromises.push(applyStateChange({ [key]: value } as Partial<TState>, false, true));
      }

      await Promise.all(applyPromises);

      this.hasHydrated = true;
      const duration = startTime ? Date.now() - startTime : 0;
      this.performanceMonitor.recordHydrationTime(duration);

      this.logger.info(`Hydrated state from database`, { operation: 'hydration' });
    } catch (error) {
      this.logger.error(
        'Hydration failed',
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'hydration' },
      );

      throw new HydrationError('Failed to hydrate state', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private shouldSkipField(key: string, value: unknown): boolean {
    return (
      (typeof value === 'string' && value.length === 0) || value === null || key === 'multiplayer'
    );
  }

  getHydrationStatus(): boolean {
    return this.hasHydrated;
  }

  resetHydrationStatus(): void {
    this.hasHydrated = false;
    this.isHydrating = false;
    this.hydrationPromise = null;
  }
}

// ============================================================================
// SYNC QUEUE MANAGER
// ============================================================================

class SyncQueueManager<TState> {
  private pendingChanges: StateChange<TState>[] = [];
  private isProcessing = false;

  constructor(
    private logger: Logger,
    private performanceMonitor: PerformanceMonitor,
  ) {}

  addPendingChange(change: Omit<StateChange<TState>, 'timestamp' | 'id'>): void {
    const fullChange: StateChange<TState> = {
      ...change,
      timestamp: Date.now(),
      id: this.generateId(),
    };

    this.pendingChanges.push(fullChange);
    this.logger.debug(`Added pending change: ${fullChange.id}`, { operation: 'sync-queue' });
  }

  getPendingChanges(): StateChange<TState>[] {
    return [...this.pendingChanges];
  }

  clearPendingChanges(): void {
    const count = this.pendingChanges.length;
    this.pendingChanges = [];
    this.logger.debug(`Cleared ${count} pending changes`, { operation: 'sync-queue' });
  }

  async processPendingChanges(
    applyStateChange: (
      partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>),
      replace?: boolean,
    ) => Promise<void>,
  ): Promise<void> {
    if (this.isProcessing || this.pendingChanges.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const changesToProcess = [...this.pendingChanges];
      this.pendingChanges = [];

      for (const change of changesToProcess) {
        await applyStateChange(change.partial, change.replace);
        this.performanceMonitor.recordStateChange();
      }
    } catch (error) {
      this.logger.error(
        'Error processing offline changes',
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'sync-queue' },
      );
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// MAIN MULTIPLAYER ORCHESTRATOR
// ============================================================================

class MultiplayerOrchestrator<TState> {
  private logger: Logger;
  private performanceMonitor: PerformanceMonitor;
  private connectionManager: StorageManager;
  private conflictResolver: ConflictResolver<TState>;
  private stateHydrator: StateHydrator<TState>;
  private syncQueueManager: SyncQueueManager<TState>;
  private stateBeforeDisconnection: TState | null = null;
  private cleanupFunctions: Array<() => void> = [];

  constructor(
    private client: HPKVStorage,
    private options: MultiplayerOptions<TState>,
    private api: StoreApi<TState>,
  ) {
    this.logger = createLogger(options.logLevel ?? LogLevel.INFO);
    this.performanceMonitor = new PerformanceMonitor(options.profiling ?? false);

    this.connectionManager = new StorageManager(this.client, this.logger);
    this.conflictResolver = new ConflictResolver(this.logger);
    this.stateHydrator = new StateHydrator(this.client, this.logger, this.performanceMonitor);
    this.syncQueueManager = new SyncQueueManager(this.logger, this.performanceMonitor);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const connectionCleanup = this.connectionManager.addConnectionListener(
      (state: ConnectionState) => {
        this.handleConnectionStateChange(state);
      },
    );
    this.cleanupFunctions.push(connectionCleanup);

    const changeListener = async (event: HPKVChangeEvent) => {
      this.logger.debug(`Remote state update for key '${event.key}'`, {
        operation: 'change-listener',
        clientId: this.client.getClientId(),
      });
      if (event.value === null) {
        event.value = (this.api.getInitialState() as Record<string, unknown>)[event.key];
      }
      await this.applyStateChange({ [event.key]: event.value } as Partial<TState>, false, true);
    };

    const removeChangeListener = this.client.addChangeListener(changeListener);
    this.cleanupFunctions.push(removeChangeListener);
  }

  private async handleConnectionStateChange(state: ConnectionState): Promise<void> {
    try {
      if (state === ConnectionState.DISCONNECTED) {
        this.stateBeforeDisconnection = { ...this.api.getState() } as TState;
        this.stateHydrator.resetHydrationStatus();
        this.updateMultiplayerState({ hasHydrated: false });
      }

      this.updateMultiplayerState({ connectionState: state });

      if (state === ConnectionState.CONNECTED) {
        await this.hydrate();
      }
    } catch (error) {
      this.logger.error(
        'Error handling connection state change',
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'connection' },
      );
    }
  }

  async hydrate(): Promise<void> {
    try {
      await this.stateHydrator.hydrate(
        (partial, replace, isRemote) => this.applyStateChange(partial, replace, isRemote),
        this.options.onHydrate,
      );

      await this.processConflictsAndPendingChanges();

      this.updateMultiplayerState({ hasHydrated: true });
    } catch (error) {
      this.logger.error(
        'Hydration failed',
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'hydration' },
      );
      throw error;
    }
  }

  private async processConflictsAndPendingChanges(): Promise<void> {
    const pendingChanges = this.syncQueueManager.getPendingChanges();

    if (this.stateBeforeDisconnection && pendingChanges.length > 0) {
      const currentState = this.api.getState() as TState;
      const conflicts = this.conflictResolver.detectConflicts(
        this.stateBeforeDisconnection,
        currentState,
        pendingChanges,
      );

      const resolvedChanges = this.conflictResolver.resolveConflicts(
        conflicts,
        pendingChanges,
        this.options.onConflict,
      );

      this.syncQueueManager.clearPendingChanges();

      for (const change of resolvedChanges) {
        await this.applyStateChange(change.partial, change.replace, false);
      }
    } else {
      await this.syncQueueManager.processPendingChanges((partial, replace) =>
        this.applyStateChange(partial, replace, false),
      );
    }
    this.stateBeforeDisconnection = null;
  }

  async applyStateChange(
    partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>),
    replace?: boolean,
    isRemoteUpdate: boolean = false,
  ): Promise<void> {
    try {
      const nextState =
        typeof partial === 'function'
          ? (partial as (state: TState) => TState | Partial<TState>)(this.api.getState())
          : partial;

      if (replace === true) {
        this.api.setState(nextState as TState, true);
      } else {
        this.api.setState(nextState, false);
      }

      this.logger.debug(
        `Updated local state for '${Object.entries(nextState)
          .map(([key, value]) => `${key}:${value}`)
          .join(', ')}'`,
        { operation: 'state-change', clientId: this.client.getClientId() },
      );

      if (!isRemoteUpdate) {
        await this.syncStateToRemote(nextState as Partial<TState>);
      }

      this.performanceMonitor.recordStateChange();
    } catch (error) {
      this.logger.error(
        'Error applying state change',
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'state-change' },
      );
      throw error;
    }
  }

  private async syncStateToRemote(state: Partial<TState>): Promise<void> {
    const startTime = Date.now();

    const syncPromises = Object.entries(state).map(async ([key, value]) => {
      await this.client.setItem(key, value);
      this.logger.debug(`Persisted '${key}' state in database`, {
        operation: 'sync',
        clientId: this.client.getClientId(),
      });
    });

    await Promise.all(syncPromises);

    const duration = Date.now() - startTime;
    this.performanceMonitor.recordSyncTime(duration);
  }

  handleStateChangeRequest(
    partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>),
    replace?: boolean,
  ): void {
    const connectionState = this.connectionManager.getConnectionState();

    if (
      !this.stateHydrator.getHydrationStatus() ||
      connectionState === ConnectionState.DISCONNECTED ||
      connectionState === ConnectionState.CONNECTING
    ) {
      this.syncQueueManager.addPendingChange({ partial, replace } as Omit<
        StateChange<TState>,
        'timestamp' | 'id'
      >);

      if (connectionState === ConnectionState.DISCONNECTED) {
        this.hydrate().catch(error => {
          this.logger.error(
            'Error during auto-hydration',
            error instanceof Error ? error : new Error(String(error)),
            { operation: 'auto-hydration' },
          );
        });
      }
      return;
    }

    this.applyStateChange(partial, replace, false).catch(error => {
      this.logger.error(
        'Error applying local state change',
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'state-change' },
      );
    });
  }

  private updateMultiplayerState(updates: Partial<MultiplayerState>): void {
    this.api.setState(
      state => ({
        ...state,
        multiplayer: { ...(state as any).multiplayer, ...updates },
      }),
      false,
    );
  }

  async clearStorage(): Promise<void> {
    this.logger.debug('Clearing storage', {
      operation: 'clear-storage',
      clientId: this.client.getClientId(),
    });
    await this.client.clear();
  }

  async connect(): Promise<void> {
    await this.connectionManager.connect();
  }

  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    await this.cleanup();
  }

  getConnectionStatus(): ConnectionStats | null {
    return this.connectionManager.getConnectionStats();
  }

  getMetrics(): PerformanceMetrics {
    return this.performanceMonitor.getMetrics();
  }

  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up multiplayer', { operation: 'cleanup' });

    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        this.logger.error(
          'Error during cleanup',
          error instanceof Error ? error : new Error(String(error)),
          { operation: 'cleanup' },
        );
      }
    });

    this.connectionManager.cleanup();

    try {
      await this.client.destroy();
    } catch (error) {
      this.logger.warn(`Error during client cleanup: ${error}`);
    }

    this.cleanupFunctions = [];
  }
}

// ============================================================================
// MIDDLEWARE IMPLEMENTATION
// ============================================================================

type Multiplayer = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  U = T & { multiplayer: MultiplayerState },
>(
  initializer: StateCreator<T, [...Mps, ['zustand/multiplayer', unknown]], Mcs>,
  options: MultiplayerOptions<T>,
) => StateCreator<U, Mps, [['zustand/multiplayer', U], ...Mcs]>;

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    'zustand/multiplayer': WithMultiplayerMiddleware<S, A>;
  }
}

type MultiplayerMiddleware = <TState>(
  config: StateCreator<TState, [], []>,
  options: MultiplayerOptions<TState>,
) => StateCreator<TState & { multiplayer: MultiplayerState }, [], []>;

const impl: MultiplayerMiddleware = (config, options) => (set, get, api) => {
  if (!options.apiKey && !options.tokenGenerationUrl) {
    throw new MultiplayerError(
      'Either apiKey or tokenGenerationUrl must be provided for authentication',
      'MISSING_AUTHENTICATION_CONFIG',
      false,
      { apiKey: options.apiKey, tokenGenerationUrl: options.tokenGenerationUrl },
    );
  }

  type TState = ReturnType<typeof config>;
  type TStateWithMultiplayer = TState & { multiplayer: MultiplayerState };

  const configResult = config(set, get, api);
  const initialState = (get() || configResult) as Record<string, unknown>;
  const nonFunctionKeys = Object.keys(initialState).filter(
    key => typeof initialState[key] !== 'function',
  ) as Array<keyof TState>;

  const syncOptions: MultiplayerOptions<TState> = {
    subscribeToUpdatesFor: () => nonFunctionKeys,
    publishUpdatesFor: () => nonFunctionKeys,
    onConflict: conflicts => {
      console.debug(
        `Default conflict resolution: keeping remote values for ${conflicts.length} conflicts`,
      );
      return { strategy: 'keep-remote' };
    },
    logLevel: LogLevel.INFO,
    retryConfig: createDefaultRetryConfig(),
    profiling: false,
    ...options,
  };

  const logger = createLogger(syncOptions.logLevel ?? LogLevel.INFO);

  const subscribedKeysArray = syncOptions.subscribeToUpdatesFor!().map(String);
  const publishedKeysArray = syncOptions.publishUpdatesFor!().map(String);

  const hpkvStorageOptions: HPKVStorageOptions = {
    namespace: syncOptions.namespace,
    apiBaseUrl: syncOptions.apiBaseUrl,
    apiKey: syncOptions.apiKey,
    tokenGenerationUrl: syncOptions.tokenGenerationUrl,
    clientConfig: syncOptions.clientConfig,
    retryConfig: syncOptions.retryConfig,
  };

  const client: HPKVStorage = createHPKVStorage(
    hpkvStorageOptions,
    subscribedKeysArray,
    publishedKeysArray,
    logger,
  );

  const orchestrator = new MultiplayerOrchestrator(client, syncOptions, api as any);

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

  const store = config(
    <A extends TState | Partial<TState> | ((state: TState) => TState | Partial<TState>)>(
      partial: A,
      replace?: boolean,
    ) => {
      orchestrator.handleStateChangeRequest(partial as any, replace);
    },
    get,
    api,
  );

  const storeWithMultiplayer = {
    ...store,
    multiplayer: {
      ...multiplayerState,
      connectionState:
        client?.getConnectionStatus()?.connectionState ?? ConnectionState.DISCONNECTED,
      hasHydrated: false,
    },
  } as TStateWithMultiplayer;

  void orchestrator.hydrate().catch(error => {
    console.error('Initial hydration failed:', error);
  });

  if (typeof window !== 'undefined') {
    const destroy = () => orchestrator.destroy();
    window.addEventListener('beforeunload', destroy);
  }

  return storeWithMultiplayer;
};

export const multiplayer = impl as unknown as Multiplayer;
