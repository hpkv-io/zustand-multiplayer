import { ConnectionState, ConnectionStats } from '@hpkv/websocket-client';
import { StoreApi } from 'zustand/vanilla';
import { Logger, LogLevel, createLogger } from '../monitoring/logger';
import { PerformanceMonitor, PerformanceMetrics } from '../monitoring/profiler';
import { HPKVStorage, HPKVChangeEvent } from '../storage/hpkv-storage';
import { StorageKeyManager } from '../storage/storage-key-manager';
import { StorageManager } from '../storage/storage-manager';
import { ConflictResolver, StateChange } from '../sync/conflict-resolver';
import { StateHydrator } from '../sync/state-hydrator';
import { SyncQueueManager } from '../sync/sync-queue-manager';
import type {
  MultiplayerOptions,
  MultiplayerState,
  PathExtractable,
} from '../types/multiplayer-types';
import { normalizeError, getCurrentTimestamp } from '../utils';
import { getCacheManager } from '../utils/cache-manager';
import { PathManager, StatePath } from '../utils/path-manager';
import { detectActualChanges } from '../utils/state-utils';

// ============================================================================
// TYPES
// ============================================================================

type StateUpdateInput<TState> =
  | TState
  | Partial<TState>
  | ((state: TState) => TState | Partial<TState>)
  | { changes: Partial<TState>; deletions: Array<{ path: string[] }> };

type StateChangeWithDeletions<TState> = {
  changes: Partial<TState>;
  deletions: Array<{ path: string[] }>;
};

type ParsedStateUpdate<TState> = {
  state: TState | Partial<TState>;
  deletions: Array<{ path: string[] }>;
};

// ============================================================================
// MAIN MULTIPLAYER ORCHESTRATOR
// ============================================================================

export class MultiplayerOrchestrator<TState> {
  private logger: Logger;
  private performanceMonitor: PerformanceMonitor;
  private storageManager: StorageManager;
  private conflictResolver: ConflictResolver<TState>;
  private stateHydrator: StateHydrator<TState>;
  private syncQueueManager: SyncQueueManager<TState>;
  private stateBeforeDisconnection: TState | null = null;
  private cleanupFunctions: Array<() => void> = [];
  private keyManager: StorageKeyManager;
  private previousState: TState;

  constructor(
    private client: HPKVStorage,
    private options: MultiplayerOptions<TState>,
    private api: StoreApi<TState>,
    private initialState: TState,
  ) {
    this.logger = createLogger(options.logLevel ?? LogLevel.INFO);
    this.performanceMonitor = new PerformanceMonitor(options.profiling ?? false);
    this.storageManager = new StorageManager(this.client, this.logger);
    this.conflictResolver = new ConflictResolver(this.logger);
    this.keyManager = new StorageKeyManager(options.namespace);
    this.stateHydrator = new StateHydrator(
      this.client,
      this.logger,
      this.performanceMonitor,
      this.keyManager,
    );
    this.syncQueueManager = new SyncQueueManager(this.logger);
    this.previousState = { ...this.api.getState() };
    this.setupEventListeners();
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  private setupEventListeners(): void {
    this.setupConnectionListener();
    this.setupChangeListener();
  }

  private setupConnectionListener(): void {
    const connectionCleanup = this.storageManager.addConnectionListener(
      (state: ConnectionState) => {
        this.handleConnectionStateChange(state);
      },
    );
    this.cleanupFunctions.push(connectionCleanup);
  }

  private setupChangeListener(): void {
    const changeListener = async (event: HPKVChangeEvent) => {
      await this.handleRemoteChange(event);
    };

    const removeChangeListener = this.client.addChangeListener(changeListener);
    this.cleanupFunctions.push(removeChangeListener);
  }

  private async handleRemoteChange(event: HPKVChangeEvent): Promise<void> {
    const statePath = this.keyManager.parseStorageKey(event.key);
    const currentState = this.api.getState() as Record<string, any>;

    if (event.value === null) {
      await this.handleRemoteDeletion(statePath, currentState);
    } else {
      await this.handleRemoteUpdate(statePath, event.value, currentState);
    }
  }

  private async handleRemoteDeletion(
    statePath: StatePath,
    currentState: Record<string, any>,
  ): Promise<void> {
    const deletionUpdate = PathManager.buildDeleteUpdate(
      statePath,
      currentState,
      this.initialState as Record<string, unknown>,
      this.options.zFactor ?? 2,
    );
    // Apply the deletion first
    await this.applyStateChange(deletionUpdate as Partial<TState>, false, true);

    // Then clean up any empty parent objects in the full state
    const currentFullState = this.api.getState();
    const cleanedState = PathManager.cleanupEmptyObjects(currentFullState as Record<string, any>);

    // Only apply if cleanup actually changed something
    if (JSON.stringify(cleanedState) !== JSON.stringify(currentFullState)) {
      await this.applyStateChange(cleanedState as Partial<TState>, true, true);
    }
  }

  private async handleRemoteUpdate(
    statePath: StatePath,
    value: unknown,
    currentState: Record<string, any>,
  ): Promise<void> {
    const stateUpdate = PathManager.buildSetUpdate(statePath, value, currentState);
    await this.applyStateChange(stateUpdate as Partial<TState>, false, true);
  }

  private async handleConnectionStateChange(state: ConnectionState): Promise<void> {
    if (state === ConnectionState.DISCONNECTED) {
      this.stateBeforeDisconnection = { ...this.api.getState() } as TState;
      this.stateHydrator.resetHydrationStatus();
      this.updateMultiplayerState({ hasHydrated: false });
    }

    this.updateMultiplayerState({ connectionState: state });

    if (state === ConnectionState.CONNECTED) {
      await this.hydrate();
    }
  }

  // ============================================================================
  // HYDRATION AND CONFLICT RESOLUTION
  // ============================================================================

  async hydrate(): Promise<void> {
    try {
      await this.stateHydrator.hydrate(
        (partial, replace, isRemote) => this.applyStateChange(partial, replace, isRemote),
        this.options.onHydrate,
      );

      await this.processConflictsAndPendingChanges();
      this.updateMultiplayerState({ hasHydrated: true });
    } catch (error) {
      this.logger.error('Hydration failed', normalizeError(error), { operation: 'hydration' });
      throw error;
    }
  }

  private async processConflictsAndPendingChanges(): Promise<void> {
    const pendingChanges = this.syncQueueManager.getPendingChanges();

    if (this.stateBeforeDisconnection && pendingChanges.length > 0) {
      await this.resolveConflictsAndApplyChanges(pendingChanges);
    } else {
      await this.processPendingChanges();
    }

    this.stateBeforeDisconnection = null;
  }

  private async resolveConflictsAndApplyChanges(
    pendingChanges: StateChange<TState>[],
  ): Promise<void> {
    const currentState = this.api.getState() as TState;
    const conflicts = this.conflictResolver.detectConflicts(
      this.stateBeforeDisconnection!,
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
  }

  private async processPendingChanges(): Promise<void> {
    await this.syncQueueManager.processPendingChanges((partial, replace) =>
      this.applyStateChange(partial, replace, false),
    );
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  async applyStateChange(
    partial: StateUpdateInput<TState>,
    replace?: boolean,
    isRemoteUpdate: boolean = false,
  ): Promise<void> {
    try {
      const { state: nextState, deletions } = this.parseStateUpdate(partial);
      this.logger.debug(`Applying state change locally : ${JSON.stringify(nextState)}`, {
        operation: 'state-change',
        clientId: this.client.getClientId(),
      });
      if (replace === true) {
        this.api.setState(nextState as TState, true);
      } else {
        this.api.setState(nextState, false);
      }

      if (!isRemoteUpdate) {
        this.logger.debug(`Syncing state change to remote : ${JSON.stringify(nextState)}`, {
          operation: 'state-change',
          clientId: this.client.getClientId(),
        });
        await this.syncStateToRemote(nextState as Partial<TState>, deletions);
      } else {
        this.updatePreviousStateTracking();
      }

      this.performanceMonitor.recordStateChange();
    } catch (error) {
      this.logger.error('Error applying state change', normalizeError(error), {
        operation: 'state-change',
      });
      throw error;
    }
  }

  private parseStateUpdate(partial: StateUpdateInput<TState>): ParsedStateUpdate<TState> {
    let state: TState | Partial<TState>;
    let deletions: Array<{ path: string[] }> = [];

    if (this.isStateChangeWithDeletions(partial)) {
      state = partial.changes;
      deletions = partial.deletions;
    } else if (typeof partial === 'function') {
      const func = partial as (state: TState) => TState | Partial<TState>;
      state = func(this.api.getState());
    } else {
      state = partial as TState | Partial<TState>;
    }

    return { state, deletions };
  }

  private isStateChangeWithDeletions(
    partial: StateUpdateInput<TState>,
  ): partial is StateChangeWithDeletions<TState> {
    return (
      typeof partial === 'object' &&
      partial !== null &&
      'changes' in partial &&
      'deletions' in partial
    );
  }

  private updatePreviousStateTracking(): void {
    this.previousState = { ...this.api.getState() };
  }

  // ============================================================================
  // REMOTE SYNCHRONIZATION
  // ============================================================================

  private async syncStateToRemote(
    state: Partial<TState>,
    deletions: Array<{ path: string[] }> = [],
  ): Promise<void> {
    const startTime = getCurrentTimestamp();

    if (!this.isValidStateForSync(state)) {
      return;
    }

    const actualChanges = this.detectSerializableChanges(state);
    const deletionPromises = this.createDeletionPromises(deletions);

    if (actualChanges.length === 0 && deletionPromises.length === 0) {
      return;
    }

    const syncPromises = this.createSyncPromises(actualChanges);
    await Promise.all([...syncPromises, ...deletionPromises]);

    this.updatePreviousStateTracking();
    this.recordSyncMetrics(startTime);
  }

  private isValidStateForSync(state: Partial<TState>): boolean {
    return state !== null && typeof state === 'object';
  }

  private detectSerializableChanges(state: Partial<TState>) {
    const zFactor = this.options.zFactor ?? 2;

    // Clear the path extraction cache to ensure fresh results
    // This is important when object contents change but references remain the same
    getCacheManager().pathExtractionCache.clear();

    const actualChanges = detectActualChanges(
      this.previousState as PathExtractable,
      state as PathExtractable,
      [],
      zFactor,
    );

    return actualChanges.filter(({ path, value }) => {
      return !this.shouldSkipPath(path, value);
    });
  }

  private shouldSkipPath(path: string[], value: unknown): boolean {
    const statePath = PathManager.fromArray(path);

    if (PathManager.shouldSkipMultiplayerPrefix(statePath)) {
      return true;
    }

    if (typeof value === 'function' || value === undefined) {
      return true;
    }

    return false;
  }

  private createDeletionPromises(deletions: Array<{ path: string[] }>): Promise<void>[] {
    return deletions.map(async deletion => {
      const storageKey = this.keyManager.createStorageKey(deletion.path);
      return await this.client.removeItem(storageKey);
    });
  }

  private createSyncPromises(actualChanges: Array<{ path: string[]; value: unknown }>) {
    return actualChanges.map(({ path, value }) => {
      const storageKey = this.keyManager.createStorageKey(path);
      return this.client.setItem(storageKey, value);
    });
  }

  private recordSyncMetrics(startTime: number): void {
    const duration = getCurrentTimestamp() - startTime;
    this.performanceMonitor.recordSyncTime(duration);
  }

  // ============================================================================
  // STATE CHANGE REQUEST HANDLING
  // ============================================================================

  handleStateChangeRequest(partial: StateUpdateInput<TState>, replace?: boolean): void {
    const connectionState = this.storageManager.getConnectionState();

    if (this.shouldQueueStateChange(connectionState)) {
      this.queueStateChange(partial, replace, connectionState);
      return;
    }

    this.applyStateChange(partial, replace, false);
  }

  private shouldQueueStateChange(connectionState: ConnectionState): boolean {
    return (
      !this.stateHydrator.getHydrationStatus() ||
      connectionState === ConnectionState.DISCONNECTED ||
      connectionState === ConnectionState.CONNECTING
    );
  }

  private queueStateChange(
    partial: StateUpdateInput<TState>,
    replace: boolean | undefined,
    connectionState: ConnectionState,
  ): void {
    this.syncQueueManager.addPendingChange({ partial, replace } as Omit<
      StateChange<TState>,
      'timestamp' | 'id'
    >);

    if (connectionState === ConnectionState.DISCONNECTED) {
      this.initiateAutoHydration();
    }
  }

  private async initiateAutoHydration(): Promise<void> {
    await this.connect();
    await this.hydrate();
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private updateMultiplayerState(updates: Partial<MultiplayerState>): void {
    this.api.setState(state => {
      const stateWithMultiplayer = state as TState & { multiplayer: MultiplayerState };
      return {
        ...state,
        multiplayer: { ...stateWithMultiplayer.multiplayer, ...updates },
      };
    }, false);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  async clearStorage(): Promise<void> {
    await this.client.clear();
  }

  async connect(): Promise<void> {
    await this.storageManager.connect();
  }

  async disconnect(): Promise<void> {
    await this.storageManager.disconnect();
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    await this.cleanup();
  }

  getConnectionStatus(): ConnectionStats | null {
    return this.storageManager.getConnectionStats();
  }

  getMetrics(): PerformanceMetrics {
    return this.performanceMonitor.getMetrics();
  }

  async cleanup(): Promise<void> {
    this.executeCleanupFunctions();
    this.cleanupComponents();
  }

  private executeCleanupFunctions(): void {
    this.cleanupFunctions.forEach(cleanup => {
      cleanup();
    });

    this.cleanupFunctions.length = 0;
  }

  private cleanupComponents(): void {
    this.storageManager.cleanup();
    this.stateHydrator.resetHydrationStatus();
    this.syncQueueManager.clearPendingChanges();
  }
}
