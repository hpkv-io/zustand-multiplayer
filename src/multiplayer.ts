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
  /** Custom key generators for specific fields */
  keyGenerators?: Partial<Record<keyof TState, (field: string, entryKey: string) => string>>;
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
  /** Update state using draft updates for Record fields */
  updateDraft: <T extends Record<string, unknown>>(updater: StateUpdater<T>) => Promise<void>;
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
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Detect Record fields in the initial state
 */
function detectRecordFields<TState>(state: TState): Array<keyof TState> {
  const recordFields: Array<keyof TState> = [];

  for (const [key, value] of Object.entries(state as Record<string, unknown>)) {
    if (isRecordType(value)) {
      recordFields.push(key as keyof TState);
    }
  }

  return recordFields;
}

/**
 * Check if a value is a Record type (plain object with string keys)
 */
function isRecordType(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Object]' &&
    !Array.isArray(value)
  );
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

  // Enhanced granular state management
  private keyManager: StorageKeyManager<TState>;
  private granularStateManager: GranularStateManager<TState> | null = null;

  constructor(
    private client: HPKVStorage,
    private options: MultiplayerOptions<TState>,
    private api: StoreApi<TState>,
    private initialState: TState,
  ) {
    this.logger = createLogger(options.logLevel ?? LogLevel.INFO);
    this.performanceMonitor = new PerformanceMonitor(options.profiling ?? false);

    this.connectionManager = new StorageManager(this.client, this.logger);
    this.conflictResolver = new ConflictResolver(this.logger);
    this.stateHydrator = new StateHydrator(this.client, this.logger, this.performanceMonitor);
    this.syncQueueManager = new SyncQueueManager(this.logger, this.performanceMonitor);

    // Automatically detect Record fields from initial state
    const recordFields = detectRecordFields(this.initialState);

    // Create automatic key generators for detected Record fields
    const autoKeyGenerators: Partial<
      Record<keyof TState, (field: string, entryKey: string) => string>
    > = {};
    for (const field of recordFields) {
      const fieldKey = field as keyof TState;
      if (!options.keyGenerators?.[fieldKey]) {
        autoKeyGenerators[fieldKey] = (fieldName: string, entryKey: string) =>
          `${options.namespace}:${fieldName}:${entryKey}`;
      }
    }

    // Merge custom and automatic key generators
    const allKeyGenerators = { ...autoKeyGenerators, ...options.keyGenerators };

    // Initialize granular state management
    this.keyManager = new StorageKeyManager(options.namespace, allKeyGenerators);

    // Always enable granular state manager if we have Record fields
    if (recordFields.length > 0 || options.keyGenerators) {
      this.granularStateManager = new GranularStateManager(this.keyManager, this.logger, updates =>
        this.syncGranularUpdates(updates),
      );
    }

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
      this.logger.debug(`Remote state update for key '${event.key}' : ${event.value}`, {
        operation: 'change-listener',
        clientId: this.client.getClientId(),
      });

      // Parse the storage key to determine if it's a granular update
      const parsed = this.keyManager.parseStorageKey(event.key);

      if (parsed.isGranular && this.granularStateManager) {
        // Handle granular updates
        const update: GranularUpdate = {
          field: parsed.field,
          subKey: parsed.subKey,
          value: event.value,
          operation: event.value === null ? 'delete' : 'set',
          storageKey: event.key,
        };

        const stateUpdate = this.granularStateManager.applyRemoteGranularUpdate(
          update,
          this.api.getState(),
        );

        await this.applyStateChange(stateUpdate, false, true);
      } else {
        // Handle traditional non-granular updates
        // If value is null, it means the key was deleted/cleared
        const updateValue =
          event.value === null
            ? (this.api.getInitialState() as Record<string, unknown>)[parsed.field]
            : event.value;

        await this.applyStateChange(
          { [parsed.field]: updateValue } as Partial<TState>,
          false,
          true,
        );
      }
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
    });

    await Promise.all(syncPromises);

    const duration = Date.now() - startTime;
    this.performanceMonitor.recordSyncTime(duration);
  }

  /**
   * Sync granular updates to remote storage
   */
  private async syncGranularUpdates(updates: GranularUpdate[]): Promise<void> {
    const startTime = Date.now();

    const syncPromises = updates.map(async update => {
      if (update.operation === 'delete') {
        // For deletions, we might need to remove the key entirely or set to null
        await this.client.setItem(`${update.field}:${update.subKey}`, null);
      } else {
        await this.client.setItem(`${update.field}:${update.subKey}`, update.value);
      }

      this.logger.debug(
        `Synced granular update for key '${update.storageKey}' (${update.operation})`,
        {
          operation: 'granular-sync',
          clientId: this.client.getClientId(),
        },
      );
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

  getSubscriptionPatterns(): string[] {
    return this.keyManager.getSubscriptionPatterns();
  }

  /**
   * Handle draft-style state updates
   */
  async handleDraftUpdate(updater: StateUpdater<TState>): Promise<void> {
    if (!this.granularStateManager) {
      throw new MultiplayerError(
        'Draft updates are not available. No Record fields detected in state',
        'DRAFT_UPDATES_DISABLED',
        false,
      );
    }

    try {
      const currentState = this.api.getState();
      const draft = this.granularStateManager.createDraftState(currentState);
      const result = updater(draft);
      const finalState = await this.granularStateManager.finalizeDraftUpdates(result || draft);

      // Apply the cleaned state to the store
      this.api.setState(finalState, false);

      this.logger.debug('Completed draft update', {
        operation: 'draft-update',
        clientId: this.client.getClientId(),
      });

      this.performanceMonitor.recordStateChange();
    } catch (error) {
      this.logger.error(
        'Error during draft update',
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'draft-update' },
      );
      throw error;
    }
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

  // Generate subscription patterns - orchestrator will handle Record detection internally
  // Use broad pattern-based subscriptions to catch all potential granular updates
  const subscribedKeysArray: string[] = [
    // Traditional field subscriptions
    ...syncOptions.subscribeToUpdatesFor!().map(key => String(key)),
  ];

  // Pass just the field names, not full keys - HPKVStorage will add namespace prefix
  const publishedKeysArray = syncOptions.publishUpdatesFor!().map(key => String(key));

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

  const orchestrator = new MultiplayerOrchestrator(client, syncOptions, api as any, configResult);

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
    updateDraft: <T extends Record<string, unknown>>(updater: StateUpdater<T>) =>
      orchestrator.handleDraftUpdate(updater as StateUpdater<TState>),
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
    // Add updateDraft method directly to the store state
    updateDraft: <T extends Record<string, unknown>>(updater: StateUpdater<T>) =>
      orchestrator.handleDraftUpdate(updater as StateUpdater<TState>),
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

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Enhanced Zustand Multiplayer Middleware Usage Examples
 *
 * @example Basic Usage with Automatic Record Detection
 * ```typescript
 * interface TodoState {
 *   todos: Record<string, Todo>;  // Automatically detected and uses granular storage
 *   user: { name: string; email: string };
 *   settings: { theme: string; notifications: boolean };
 * }
 *
 * const useTodoStore = create(
 *   multiplayer(
 *     (set, get) => ({
 *       todos: {},  // Record type automatically gets granular storage
 *       user: { name: '', email: '' },
 *       settings: { theme: 'light', notifications: true },
 *
 *       // Traditional methods still work
 *       addTodo: (todo: Todo) => set(state => ({
 *         todos: { ...state.todos, [todo.id]: todo }
 *       })),
 *
 *       updateUser: (updates: Partial<User>) => set(state => ({
 *         user: { ...state.user, ...updates }
 *       })),
 *     }),
 *     {
 *       namespace: 'todo-app',
 *       apiBaseUrl: 'https://api.hpkv.io',
 *       apiKey: 'your-api-key',
 *       // Custom key generators are optional - defaults are provided
 *       keyGenerators: {
 *         todos: (field, entryKey) => `todo-app:todos:${entryKey}`,
 *       }
 *     }
 *   )
 * );
 *
 * // Usage with granular updates - no conflicts between users!
 * const { updateDraft } = useTodoStore.getState().multiplayer;
 *
 * // Update specific todos without affecting other users' concurrent edits
 * await updateDraft(draft => {
 *   // User A can edit todo-1 while User B edits todo-2 simultaneously
 *   draft.todos['todo-1'] = {
 *     id: 'todo-1',
 *     text: 'Updated by User A',
 *     completed: true
 *   };
 *
 *   // Remove a todo
 *   draft.todos.__granular_delete__('todo-3');
 *
 *   // Add a new todo
 *   draft.todos['todo-4'] = {
 *     id: 'todo-4',
 *     text: 'New todo',
 *     completed: false
 *   };
 * });
 * ```
 *
 * @example Advanced Configuration with Custom Key Generators
 * ```typescript
 * const useAdvancedStore = create(
 *   multiplayer(
 *     (set, get) => ({
 *       users: {} as Record<string, User>,     // Auto-detected Record type
 *       projects: {} as Record<string, Project>, // Auto-detected Record type
 *       metadata: { version: 1, lastUpdated: Date.now() } // Regular field
 *     }),
 *     {
 *       namespace: 'collaboration-app',
 *       apiBaseUrl: 'https://api.hpkv.io',
 *       apiKey: 'your-api-key',
 *       // Override default key generation for specific fields
 *       keyGenerators: {
 *         users: (field, entryKey) => `app:user:${entryKey}`,
 *         projects: (field, entryKey) => `app:project:${entryKey}`,
 *       }
 *     }
 *   )
 * );
 * ```
 *
 * @example Pattern-Based Subscriptions
 * With automatic Record detection, the middleware automatically generates
 * HPKV subscription patterns for detected Record fields:
 *
 * - "namespace:*" - Subscribe to all namespace keys
 * - "namespace:todos:*" - Subscribe to all todo items
 * - "namespace:users:*" - Subscribe to all user items
 *
 * This enables dynamic subscription to new keys as they're created.
 */

// ============================================================================
// GRANULAR UPDATE TYPES
// ============================================================================

/**
 * Represents a granular update to a specific field
 */
export interface GranularUpdate<T = any> {
  /** The field being updated */
  field: string;
  /** The sub-key within the field (for Record types) */
  subKey?: string;
  /** The new value */
  value: T;
  /** The operation type */
  operation: 'set' | 'delete' | 'patch';
  /** The full storage key */
  storageKey: string;
}

/**
 * Draft-like interface for Immer-style updates
 */
export type DraftState<T> = {
  [K in keyof T]: T[K] extends Record<string, infer V>
    ? Record<string, V> & {
        __granular_set__(key: string, value: V): void;
        __granular_delete__(key: string): void;
      }
    : T[K];
};

/**
 * Update function that receives a draft state
 */
export type StateUpdater<T> = (draft: DraftState<T>) => void | DraftState<T>;

/**
 * Storage key utilities
 */
export class StorageKeyManager<TState> {
  constructor(
    private namespace: string,
    private config?: Partial<Record<keyof TState, (field: string, entryKey: string) => string>>,
  ) {}

  /**
   * Generate storage key for a field
   */
  getFieldKey(field: keyof TState): string {
    return `${this.namespace}:${String(field)}`;
  }

  /**
   * Generate storage key for a record entry
   */
  getRecordEntryKey(field: keyof TState, entryKey: string): string {
    const customGenerator = this.config?.[field];
    if (customGenerator) {
      return customGenerator(String(field), entryKey);
    }
    return `${this.namespace}:${String(field)}:${entryKey}`;
  }

  /**
   * Generate subscription patterns for granular fields
   */
  getSubscriptionPatterns(): string[] {
    const patterns: string[] = [`${this.namespace}:*`];

    if (this.config) {
      for (const field in this.config) {
        patterns.push(`${this.namespace}:${String(field)}:*`);
      }
    }

    return patterns;
  }

  /**
   * Parse a storage key to extract field and subkey information
   */
  parseStorageKey(storageKey: string): { field: string; subKey?: string; isGranular: boolean } {
    //const prefix = `${this.namespace}:`;
    /* if (!storageKey.startsWith(prefix)) {
      return { field: storageKey, isGranular: false };
    } */

    const keyParts = storageKey.split(':');
    if (keyParts.length === 1) {
      return { field: keyParts[0], isGranular: false };
    }

    const [field, ...subKeyParts] = keyParts;
    return {
      field,
      subKey: subKeyParts.join(':'),
      isGranular: true,
    };
  }

  /**
   * Check if a field should use record-based storage
   */
  isRecordField(field: keyof TState): boolean {
    return this.config?.[field] !== undefined;
  }

  /**
   * Check if a field should use nested object storage
   */
  isNestedObjectField(field: keyof TState): boolean {
    return this.config?.[field] !== undefined;
  }
}

// ============================================================================
// GRANULAR STATE MANAGER
// ============================================================================

/**
 * Manages granular state updates and creates draft states
 */
export class GranularStateManager<TState> {
  private pendingUpdates: Map<string, GranularUpdate> = new Map();
  private isInDraftMode = false;

  constructor(
    private keyManager: StorageKeyManager<TState>,
    private logger: Logger,
    private syncToRemote: (updates: GranularUpdate[]) => Promise<void>,
  ) {}

  /**
   * Create a draft state for Immer-like updates
   */
  createDraftState(currentState: TState): DraftState<TState> {
    this.isInDraftMode = true;
    this.pendingUpdates.clear();

    const draft = { ...currentState } as any;

    // Enhance record fields with granular update methods
    for (const [key, value] of Object.entries(currentState as Record<string, unknown>)) {
      const fieldKey = key as keyof TState;

      if (this.keyManager.isRecordField(fieldKey) && typeof value === 'object' && value !== null) {
        draft[key] = this.createRecordProxy(fieldKey, value as Record<string, any>);
      }
    }

    return draft as DraftState<TState>;
  }

  /**
   * Create a proxy for Record fields to track granular changes
   */
  private createRecordProxy<V>(
    field: keyof TState,
    record: Record<string, V>,
  ): Record<string, V> & {
    __granular_set__(key: string, value: V): void;
    __granular_delete__(key: string): void;
  } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const granularStateManager = this;

    return new Proxy(
      {
        ...record,
        __granular_set__(key: string, value: V): void {
          granularStateManager.addPendingUpdate(field, key, value, 'set');
        },
        __granular_delete__(key: string): void {
          granularStateManager.addPendingUpdate(field, key, undefined, 'delete');
        },
      } as any,
      {
        set(target, prop, value) {
          if (typeof prop === 'string' && !prop.startsWith('__granular_')) {
            granularStateManager.addPendingUpdate(field, prop, value, 'set');
          }
          target[prop] = value;
          return true;
        },
        deleteProperty(target, prop) {
          if (typeof prop === 'string' && !prop.startsWith('__granular_')) {
            granularStateManager.addPendingUpdate(field, prop, undefined, 'delete');
          }
          delete target[prop];
          return true;
        },
      },
    );
  }

  /**
   * Add a pending update
   */
  private addPendingUpdate<V>(
    field: keyof TState,
    subKey?: string,
    value?: V,
    operation: 'set' | 'delete' | 'patch' = 'set',
  ): void {
    const storageKey = subKey
      ? this.keyManager.getRecordEntryKey(field, subKey)
      : this.keyManager.getFieldKey(field);

    const update: GranularUpdate<V> = {
      field: String(field),
      subKey,
      value: value as V,
      operation,
      storageKey,
    };

    this.pendingUpdates.set(storageKey, update);
  }

  /**
   * Apply pending updates and return the modified state
   */
  async finalizeDraftUpdates(draftState: DraftState<TState>): Promise<TState> {
    try {
      const updates = Array.from(this.pendingUpdates.values());

      if (updates.length > 0) {
        this.logger.debug(`Applying ${updates.length} granular updates`, {
          operation: 'granular-update',
        });

        // Sync to remote storage
        await this.syncToRemote(updates);
      }

      // Clean up proxy methods from the state
      const cleanState = this.cleanDraftState(draftState);
      return cleanState;
    } finally {
      this.isInDraftMode = false;
      this.pendingUpdates.clear();
    }
  }

  /**
   * Clean proxy methods from draft state
   */
  private cleanDraftState(draftState: DraftState<TState>): TState {
    const cleanState = { ...draftState } as any;

    for (const [key, value] of Object.entries(cleanState)) {
      if (typeof value === 'object' && value !== null && '__granular_set__' in value) {
        const { __granular_set__, __granular_delete__, ...cleanRecord } = value as any;
        cleanState[key] = cleanRecord;
      }
    }

    return cleanState as TState;
  }

  /**
   * Apply remote granular updates to local state
   */
  applyRemoteGranularUpdate(update: GranularUpdate, currentState: TState): Partial<TState> {
    const { field, subKey, value, operation } = update;
    const currentValue = (currentState as any)[field];

    if (!subKey) {
      // Simple field update
      return { [field]: value } as Partial<TState>;
    }

    // Record field update
    if (typeof currentValue === 'object' && currentValue !== null) {
      const newRecord = { ...currentValue };

      if (operation === 'delete') {
        delete newRecord[subKey];
      } else {
        newRecord[subKey] = value;
      }

      return { [field]: newRecord } as Partial<TState>;
    }

    // Initialize empty record if field doesn't exist
    return { [field]: { [subKey]: value } } as Partial<TState>;
  }

  /**
   * Check if currently in draft mode
   */
  isDraftMode(): boolean {
    return this.isInDraftMode;
  }

  /**
   * Get pending updates (for debugging)
   */
  getPendingUpdates(): GranularUpdate[] {
    return Array.from(this.pendingUpdates.values());
  }
}
