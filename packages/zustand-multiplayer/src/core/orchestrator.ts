import type { ConnectionStats } from '@hpkv/websocket-client';
import { ConnectionState } from '@hpkv/websocket-client';
import type { StoreApi } from 'zustand/vanilla';
import type { Logger } from '../monitoring/logger';
import type { PerformanceMetrics, PerformanceMonitor } from '../monitoring/profiler';
import type { HPKVChangeEvent, HPKVStorage } from '../storage/hpkv-storage';
import { StorageKeyManager } from '../storage/storage-key-manager';
import type { MultiplayerOptions, MultiplayerState } from '../types/multiplayer-types';
import { DEFAULT_Z_FACTOR } from '../utils/constants';
import { StateDiffManager } from './state-diff-manager';
import { StateMerger } from './state-merger';

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export class Orchestrator<TState> {
  private readonly cleanupFunctions: Array<() => void> = [];
  private readonly keyManager: StorageKeyManager;
  private readonly diffManager: StateDiffManager;
  private readonly merger: StateMerger<TState>;
  private isHydrating = false;
  private hasHydrated = false;

  constructor(
    private readonly client: HPKVStorage,
    private readonly options: MultiplayerOptions<TState>,
    private readonly api: StoreApi<TState>,
    private readonly performanceMonitor: PerformanceMonitor,
    private readonly logger: Logger,
  ) {
    this.keyManager = new StorageKeyManager(options.namespace, options.zFactor);
    this.diffManager = new StateDiffManager();
    this.merger = new StateMerger<TState>(options.zFactor ?? DEFAULT_Z_FACTOR);
    this.setupEventListeners();
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  private setupEventListeners(): void {
    const connectionListener = (state: ConnectionState): void => {
      void this.handleConnectionStateChange(state);
    };

    const removeConnectionListener = this.client.addConnectionListener(connectionListener);
    this.cleanupFunctions.push(removeConnectionListener);

    const removeChangeListener = this.client.addChangeListener((event: HPKVChangeEvent) => {
      void this.handleRemoteChange(event);
    });

    this.cleanupFunctions.push(removeChangeListener);
  }

  private async handleConnectionStateChange(state: ConnectionState): Promise<void> {
    this.logger.info(`Connection state changed to ${state}`, {
      clientId: this.client.getClientId(),
    });

    if (state === ConnectionState.DISCONNECTED) {
      this.hasHydrated = false;
      this.updateMultiplayerState({ hasHydrated: false });
    }

    this.updateMultiplayerState({ connectionState: state });

    if (state === ConnectionState.CONNECTED && !this.hasHydrated) {
      await this.hydrate();
    }
  }

  // ============================================================================
  // STATE SYNCHRONIZATION
  // ============================================================================

  /**
   * Handle local state changes and sync them to remote storage
   * This is called whenever the local store is updated
   */
  async handleLocalStateChange(
    partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>),
    replace?: boolean,
  ): Promise<void> {
    const oldState = this.api.getState();

    if (replace) {
      this.api.setState(partial as TState, replace);
    } else {
      this.api.setState(partial, replace);
    }

    const newState = this.api.getState();

    await this.syncToRemote(newState, oldState);
  }

  /**
   * Handle remote state changes received from other clients
   * Merges the remote changes into the local state
   */
  private handleRemoteChange(event: HPKVChangeEvent): void {
    const path = this.parseStorageKey(event.key);

    this.logger.debug(
      `Received remote ${event.value === null ? 'Delete' : 'Update'} change for path '${path}' `,
      { clientId: this.client.getClientId() },
    );

    const currentState = this.api.getState();
    const update = this.merger.buildStateUpdate(path, event.value, currentState);
    this.api.setState(update, false);
  }

  /**
   * Sync local state changes to remote storage
   * Compares old and new state to determine what needs to be synced
   */
  private async syncToRemote(newState: TState, oldState: TState): Promise<void> {
    const syncFields = this.options.sync ?? [];
    const syncOperations = this.buildSyncOperations(newState, oldState, syncFields);

    if (syncOperations.length > 0) {
      try {
        await Promise.all(syncOperations);
        this.updateMultiplayerState({ performanceMetrics: this.performanceMonitor.getMetrics() });
      } catch (error) {
        this.logger.error('Failed to sync changes to remote storage', error as Error);
        throw error;
      }
    }
  }

  /**
   * Build the list of sync operations needed to sync state changes
   */
  private buildSyncOperations(
    newState: TState,
    oldState: TState,
    syncFields: Array<keyof TState>,
  ): Promise<void>[] {
    const operations: Promise<void>[] = [];
    const zFactor = this.options.zFactor ?? DEFAULT_Z_FACTOR;

    for (const field of syncFields) {
      const changes = this.detectFieldChanges(field, newState, oldState, zFactor);
      operations.push(...changes.deletions, ...changes.updates);
    }

    return operations;
  }

  /**
   * Detect changes in a specific field between old and new state
   */
  private detectFieldChanges(
    field: keyof TState,
    newState: TState,
    oldState: TState,
    zFactor: number,
  ): { deletions: Promise<void>[]; updates: Promise<void>[] } {
    const fieldStr = String(field);
    const currentValue = (newState as Record<string, unknown>)[field as string];
    const previousValue = (oldState as Record<string, unknown>)[field as string];

    // Skip unchanged fields, functions, and system fields
    if (this.shouldSkipField(fieldStr, currentValue, previousValue)) {
      return { deletions: [], updates: [] };
    }

    // Extract paths from old and new values and compare them to find changes
    const oldPaths = this.extractFieldPaths(previousValue, fieldStr, zFactor);
    const newPaths = this.extractFieldPaths(currentValue, fieldStr, zFactor);
    return this.comparePathsForChanges(oldPaths, newPaths);
  }

  /**
   * Check if a field should be skipped during sync
   */
  private shouldSkipField(
    fieldStr: string,
    currentValue: unknown,
    previousValue: unknown,
  ): boolean {
    return (
      currentValue === previousValue ||
      typeof currentValue === 'function' ||
      fieldStr === 'multiplayer'
    );
  }

  /**
   * Extract paths from a field value
   */
  private extractFieldPaths(
    value: unknown,
    fieldStr: string,
    zFactor: number,
  ): Array<{ path: string[]; value: unknown }> {
    return value !== undefined ? this.merger.extractPaths(value, [fieldStr], zFactor) : [];
  }

  /**
   * Compare old and new paths to find deletions and updates
   */
  private comparePathsForChanges(
    oldPaths: Array<{ path: string[]; value: unknown }>,
    newPaths: Array<{ path: string[]; value: unknown }>,
  ): { deletions: Promise<void>[]; updates: Promise<void>[] } {
    const oldPathMap = new Map(oldPaths.map(p => [p.path.join('.'), p.value]));
    const newPathMap = new Map(newPaths.map(p => [p.path.join('.'), p.value]));

    const operations = { deletions: [] as Promise<void>[], updates: [] as Promise<void>[] };

    // Process deletions and updates in single pass
    for (const [pathKey, _oldValue] of oldPathMap) {
      if (!newPathMap.has(pathKey)) {
        operations.deletions.push(this.client.removeItem(this.createStorageKey(pathKey)));
      }
    }

    for (const [pathKey, newValue] of newPathMap) {
      const oldValue = oldPathMap.get(pathKey);
      if (oldValue !== newValue) {
        const diff = this.diffManager.calculateDiff(oldValue, newValue);
        operations.updates.push(this.client.setItem(this.createStorageKey(pathKey), diff.data));
      }
    }

    return operations;
  }

  // ============================================================================
  // STATE HYDRATION
  // ============================================================================

  /**
   * Hydrate the local state from remote storage
   */
  async hydrate(): Promise<void> {
    if (this.isHydrating) {
      return;
    }

    this.isHydrating = true;

    try {
      const hydratedState = await this.loadRemoteState();
      this.api.setState(hydratedState, false);
      this.completeHydration();
    } catch (error) {
      this.logger.error('State hydration failed', error as Error);
      throw error;
    } finally {
      this.isHydrating = false;
    }
  }

  /**
   * Load and reconstruct state from remote storage
   */
  private async loadRemoteState(): Promise<Partial<TState>> {
    const allItems = await this.client.getAllItems();
    const hydratedState: Partial<TState> = {};

    for (const [key, value] of allItems.entries()) {
      const path = this.parseStorageKey(key);
      const pathSegments = path.split('.');
      this.merger.setNestedValue(hydratedState, pathSegments, value);
    }

    return hydratedState;
  }

  /**
   * Complete the hydration process and update metrics
   */
  private completeHydration(): void {
    this.hasHydrated = true;

    this.updateMultiplayerState({
      hasHydrated: true,
      performanceMetrics: this.performanceMonitor.getMetrics(),
    });
    this.logger.debug('Store was hydrated from remote storage', {
      clientId: this.client.getClientId(),
    });
  }

  // ============================================================================
  // STORAGE KEY UTILITIES
  // ============================================================================

  /**
   * Create a storage key from a state path
   */
  private createStorageKey(path: string): string {
    const pathArray = path.split('.');
    return this.keyManager.createStorageKey(pathArray);
  }

  /**
   * Parse a storage key back to a state path
   */
  private parseStorageKey(key: string): string {
    const statePath = this.keyManager.parseStorageKey(key);
    return statePath.segments.join('.');
  }

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
    this.logger.debug('Cleared store items', { clientId: this.client.getClientId() });
  }

  async connect(): Promise<void> {
    try {
      await this.client.ensureConnection();
      if (this.client.getConnectionStatus()?.connectionState === ConnectionState.CONNECTED) {
        this.updateMultiplayerState({ connectionState: ConnectionState.CONNECTED });
      }
    } catch (error) {
      this.logger.error('Failed to connect to remote storage', error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    this.updateMultiplayerState({ connectionState: ConnectionState.DISCONNECTED });
  }

  destroy(): Promise<void> {
    this.cleanup();
    return Promise.resolve();
  }

  getConnectionStatus(): ConnectionStats | null {
    return this.client.getConnectionStatus();
  }

  getMetrics(): PerformanceMetrics {
    return this.performanceMonitor.getMetrics();
  }

  private cleanup(): void {
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions.length = 0;
    this.performanceMonitor.cleanup?.();
  }
}
