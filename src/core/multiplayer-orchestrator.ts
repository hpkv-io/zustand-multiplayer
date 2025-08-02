import type { ConnectionStats } from '@hpkv/websocket-client';
import { ConnectionState } from '@hpkv/websocket-client';
import type { StoreApi } from 'zustand/vanilla';
import type { PerformanceMetrics } from '../monitoring/profiler';
import type { HPKVStorage, HPKVChangeEvent } from '../storage/hpkv-storage';
import type { StateChange } from '../sync/conflict-resolver';
import type {
  MultiplayerOptions,
  MultiplayerState,
  PathExtractable,
} from '../types/multiplayer-types';
import { normalizeError, getCurrentTimestamp } from '../utils';
import { getCacheManager } from '../utils/cache-manager';
import { DEFAULT_Z_FACTOR } from '../utils/constants';
import type { ServiceContainer } from './service-factory';
import type { StatePath } from './state-manager';
import {
  buildDeleteUpdate,
  cleanupEmptyObjects,
  navigate,
  buildSetUpdate,
  detectActualChanges,
  pathFromArray,
  shouldSkipMultiplayerPrefix,
} from './state-manager';

// ============================================================================
// TYPES
// ============================================================================

type StateUpdateInput<TState> =
  | TState
  | Partial<TState>
  | ((state: TState) => TState | Partial<TState>)
  | { changes: Partial<TState>; deletions: Array<{ path: string[] }> };

interface StateChangeWithDeletions<TState> {
  changes: Partial<TState>;
  deletions: Array<{ path: string[] }>;
}

interface ParsedStateUpdate<TState> {
  state: TState | Partial<TState>;
  deletions: Array<{ path: string[] }>;
}

// ============================================================================
// MAIN MULTIPLAYER ORCHESTRATOR
// ============================================================================

export class MultiplayerOrchestrator<TState> {
  private previousState: TState;
  private stateBeforeDisconnection: TState | null = null;
  private readonly cleanupFunctions: Array<() => void> = [];

  constructor(
    private readonly client: HPKVStorage,
    private readonly options: MultiplayerOptions<TState>,
    private readonly api: StoreApi<TState>,
    private readonly initialState: TState,
    private readonly services: ServiceContainer<TState>,
  ) {
    this.previousState = { ...this.api.getState() };
    this.setupEventListeners();
  }

  private get logger() {
    return this.services.logger;
  }
  private get performanceMonitor() {
    return this.services.performanceMonitor;
  }
  private get clientManager() {
    return this.services.clientManager;
  }
  private get conflictResolver() {
    return this.services.conflictResolver;
  }
  private get stateHydrator() {
    return this.services.stateHydrator;
  }
  private get syncQueueManager() {
    return this.services.syncQueueManager;
  }
  private get keyManager() {
    return this.services.keyManager;
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  private setupEventListeners(): void {
    this.setupConnectionListener();
    this.setupChangeListener();
  }

  private setupConnectionListener(): void {
    const connectionCleanup = this.clientManager.addConnectionListener((state: ConnectionState) => {
      void this.handleConnectionStateChange(state);
    });
    this.cleanupFunctions.push(connectionCleanup);
  }

  private setupChangeListener(): void {
    const changeListener = (event: HPKVChangeEvent) => {
      void this.handleRemoteChange(event);
    };

    const removeChangeListener = this.client.addChangeListener(changeListener);
    this.cleanupFunctions.push(removeChangeListener);
  }

  private async handleRemoteChange(event: HPKVChangeEvent): Promise<void> {
    const statePath = this.keyManager.parseStorageKey(event.key);
    const currentState = this.api.getState() as Record<string, unknown>;

    this.logger.debug('Received remote state change', {
      operation: 'remote-change',
      clientId: this.client.getClientId(),
      key: event.key,
      path: statePath.segments.join('.'),
      isDeletion: event.value === null,
      pathDepth: statePath.depth,
    });

    if (event.value === null) {
      await this.handleRemoteDeletion(statePath, currentState);
    } else {
      await this.handleRemoteUpdate(statePath, event.value, currentState);
    }
  }

  private async handleRemoteDeletion(
    statePath: StatePath,
    currentState: Record<string, unknown>,
  ): Promise<void> {
    const deletionUpdate = buildDeleteUpdate(
      statePath,
      currentState,
      this.initialState as Record<string, unknown>,
      this.options.zFactor ?? DEFAULT_Z_FACTOR,
    );

    await this.applyStateChange(deletionUpdate as Partial<TState>, false, true);

    const currentFullState = this.api.getState();
    const cleanedState = cleanupEmptyObjects(currentFullState as Record<string, unknown>);

    // Only apply if cleanup actually changed something
    if (JSON.stringify(cleanedState) !== JSON.stringify(currentFullState)) {
      await this.applyStateChange(cleanedState as Partial<TState>, true, true);
    }
  }

  private async handleRemoteUpdate(
    statePath: StatePath,
    value: unknown,
    currentState: Record<string, unknown>,
  ): Promise<void> {
    const zFactor = this.options.zFactor ?? DEFAULT_Z_FACTOR;

    // For zFactor=0, remote values are partial diffs that need to be merged
    // with existing state at the target path, not replaced entirely
    if (zFactor === 0 && statePath.depth === 1) {
      const existingValue = navigate(currentState, statePath).value;

      // If both the existing value and incoming value are plain objects, check if this should be merged
      if (
        existingValue &&
        typeof existingValue === 'object' &&
        !Array.isArray(existingValue) &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const existingKeys = Object.keys(existingValue as Record<string, unknown>);
        const incomingKeys = Object.keys(value as Record<string, unknown>);

        // Only merge if the incoming object has keys that don't completely replace the existing structure
        // If incoming has significantly fewer keys than existing, treat it as a replacement (e.g., deletion case)
        // If incoming has similar or more keys, treat it as a partial update that should be merged
        const isLikelyPartialUpdate =
          incomingKeys.length >= existingKeys.length * 0.5 ||
          incomingKeys.some(key => existingKeys.includes(key));

        if (isLikelyPartialUpdate) {
          // Deep merge the incoming partial diff with the existing value
          const mergedValue = this.deepMerge(
            existingValue as Record<string, unknown>,
            value as Record<string, unknown>,
          );
          const stateUpdate = buildSetUpdate(statePath, mergedValue, currentState);
          await this.applyStateChange(stateUpdate as Partial<TState>, false, true);
          return;
        }
      }
    }

    // Default behavior: replace the value entirely
    const stateUpdate = buildSetUpdate(statePath, value, currentState);
    await this.applyStateChange(stateUpdate as Partial<TState>, false, true);
  }

  /**
   * Deep merge two objects, similar to the HPKV mock client's deepMerge
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const targetValue = target[key];
        const sourceValue = source[key];

        if (
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue) &&
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue)
        ) {
          result[key] = this.deepMerge(
            targetValue as Record<string, unknown>,
            sourceValue as Record<string, unknown>,
          );
        } else {
          result[key] = sourceValue;
        }
      }
    }

    return result;
  }

  private async handleConnectionStateChange(state: ConnectionState): Promise<void> {
    this.logger.debug('Connection state changed', {
      operation: 'connection-state-change',
      clientId: this.client.getClientId(),
      newState: state,
      hadSnapshot: !!this.stateBeforeDisconnection,
    });

    if (state === ConnectionState.DISCONNECTED) {
      this.stateBeforeDisconnection = { ...this.api.getState() };
      this.stateHydrator.resetHydrationStatus();
      this.updateMultiplayerState({ hasHydrated: false });
    }

    this.updateMultiplayerState({ connectionState: state });

    if (state === ConnectionState.CONNECTED) {
      this.logger.debug('Connection established, initiating hydration', {
        operation: 'connection-established',
        clientId: this.client.getClientId(),
      });
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
    const currentState = this.api.getState();
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

      if (replace === true) {
        this.api.setState(nextState as TState, true);
      } else {
        this.api.setState(nextState, false);
      }

      if (!isRemoteUpdate) {
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
      state = partial;
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

    this.logger.debug('Synchronizing changes to remote storage', {
      operation: 'sync-to-remote',
      clientId: this.client.getClientId(),
      changeCount: actualChanges.length,
      deletionCount: deletions.length,
      hasChanges: actualChanges.length > 0 || deletionPromises.length > 0,
    });

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
    const zFactor = this.options.zFactor ?? DEFAULT_Z_FACTOR;

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
    const statePath = pathFromArray(path);

    if (shouldSkipMultiplayerPrefix(statePath)) {
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
    const connectionState = this.clientManager.getConnectionState();

    if (this.shouldQueueStateChange(connectionState)) {
      this.queueStateChange(partial, replace, connectionState);
      return;
    }

    void this.applyStateChange(partial, replace, false);
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
      void this.initiateAutoHydration();
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
    await this.clientManager.connect();
  }

  async disconnect(): Promise<void> {
    await this.clientManager.disconnect();
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    this.cleanup();
  }

  getConnectionStatus(): ConnectionStats | null {
    return this.clientManager.getConnectionStats();
  }

  getMetrics(): PerformanceMetrics {
    return this.performanceMonitor.getMetrics();
  }

  cleanup(): void {
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
    // Use the enhanced service container for centralized cleanup
    this.services.cleanup();
    this.services.reset();
  }
}
