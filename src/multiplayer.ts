import { ConnectionConfig, ConnectionState, ConnectionStats } from '@hpkv/websocket-client';
import { StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand/vanilla';
import { produce } from 'immer';
import type { Draft } from 'immer';
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
import { generateId, getCurrentTimestamp, normalizeError, clearTimeoutSafely } from './utils';
import { StorageKeyManager } from './storageKeyManager';

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

// Type utilities for immer-style updates (similar to immer middleware)
type SkipTwo<T> = T extends { length: 0 }
  ? []
  : T extends { length: 1 }
  ? []
  : T extends { length: 0 | 1 }
  ? []
  : T extends [unknown, unknown, ...infer A]
  ? A
  : T extends [unknown, unknown?, ...infer A]
  ? A
  : T extends [unknown?, unknown?, ...infer A]
  ? A
  : never;

type SetStateType<T> = T extends readonly [any, ...any[]] ? Exclude<T[0], (...args: any[]) => any> : never;

// Enhanced set function type that accepts Draft<T>
export type ImmerStateCreator<T, Mis extends [StoreMutatorIdentifier, unknown][] = [], Mos extends [StoreMutatorIdentifier, unknown][] = [], U = T> = (
  setState: (
    partial: T | Partial<T> | ((state: Draft<T>) => void),
    replace?: boolean
  ) => void,
  getState: () => T,
  store: {
    setState: (
      partial: T | Partial<T> | ((state: Draft<T>) => void),
      replace?: boolean
    ) => void;
    getState: () => T;
    subscribe: (listener: (state: T, prevState: T) => void) => () => void;
  }
) => U;

type StoreWithImmerAndMultiplayer<S> = S extends { setState: infer SetState }
  ? SetState extends {
      (...args: infer A1): infer Sr1;
      (...args: infer A2): infer Sr2;
    }
    ? {
        setState(
          nextStateOrUpdater:
            | SetStateType<A1>
            | Partial<SetStateType<A1>>
            | ((state: Draft<SetStateType<A1>>) => void),
          shouldReplace?: false,
          ...args: SkipTwo<A1>
        ): Sr1;
        setState(
          nextStateOrUpdater:
            | SetStateType<A1>
            | ((state: Draft<SetStateType<A1>>) => void),
          shouldReplace: true,
          ...args: SkipTwo<A1>
        ): Sr2;
      }
    : never
  : never;

export type WithMultiplayerMiddleware<S, _A> = Write<S, StoreWithImmerAndMultiplayer<S> & { multiplayer: MultiplayerState<S> }>;

export type WithMultiplayer<S> = S & { multiplayer: MultiplayerState<S> };

export interface MultiplayerState<TState> {
  connectionState: ConnectionState;
  hasHydrated: boolean;
  isSubscriptionReady: boolean;
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
            normalizeError(error),
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
    clearTimeoutSafely(this.reconnectTimeoutId);
    this.reconnectTimeoutId = null;
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
    private keyManager: StorageKeyManager<TState>,
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

    const startTime = getCurrentTimestamp();
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
      const allItems = await this.client.getAllItems();
      
      // Reconstruct the state from granular storage
      const reconstructedState = {} as any;
      
      for (const [key, value] of allItems.entries()) {
        const parsed = this.keyManager.parseStorageKey(key);
        
        if (parsed.path.length === 1) {
          // Top-level field
          reconstructedState[parsed.path[0]] = value;
        } else {
          // Nested field - reconstruct the object hierarchy
          let current = reconstructedState;
          for (let i = 0; i < parsed.path.length - 1; i++) {
            const segment = parsed.path[i];
            if (!current[segment] || typeof current[segment] !== 'object') {
              current[segment] = {};
            }
            current = current[segment];
          }
          current[parsed.path[parsed.path.length - 1]] = value;
        }
      }

      try {
        onHydrate?.(reconstructedState as TState);
      } catch (error) {
        this.logger.error(
          'Error in onHydrate callback',
          normalizeError(error),
          { operation: 'hydration' },
        );
      }

      // Apply the reconstructed state
      await applyStateChange(reconstructedState, false, true);

      this.hasHydrated = true;
      const duration = startTime ? getCurrentTimestamp() - startTime : 0;
      this.performanceMonitor.recordHydrationTime(duration);

      this.logger.info(`Hydrated state from database`, { operation: 'hydration' });
    } catch (error) {
      this.logger.error(
        'Hydration failed',
        normalizeError(error),
        { operation: 'hydration' },
      );

      throw new HydrationError('Failed to hydrate state', {
        error: normalizeError(error).message,
      });
    }
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
      timestamp: getCurrentTimestamp(),
      id: generateId(),
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
        // Note: recordStateChange() is called in applyStateChange() to avoid double counting
      }
    } catch (error) {
      this.logger.error(
        'Error processing offline changes',
        normalizeError(error),
        { operation: 'sync-queue' },
      );
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }


}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract all paths to leaf values in an object
 */
function extractPaths(obj: any, parentPath: string[] = []): Array<{ path: string[]; value: any }> {
  const paths: Array<{ path: string[]; value: any }> = [];

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = [...parentPath, key];
    
    if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
      // Primitive value or array - store as leaf
      paths.push({ path: currentPath, value });
    } else if (Object.keys(value).length === 0 && currentPath.length === 1) {
      // Empty object at depth 1 (like empty todos: {}) - store as leaf
      // This ensures empty Records are synced, fixing deletion of all entries
      paths.push({ path: currentPath, value });
    } else if (currentPath.length >= 2 && isRecordType(value)) {
      // Record entries at depth 2+ should be atomic to prevent deletion issues
      paths.push({ path: currentPath, value });
    } else if (currentPath.length >= 3) {
      // Non-Record objects at depth 3+ - store as leaf to prevent over-granularization
      paths.push({ path: currentPath, value });
    } else {
      // Object - recurse deeper for regular nested objects
      paths.push(...extractPaths(value, currentPath));
    }
  }

  return paths;
}

/**
 * Check if a value appears to be a Record type (dynamic keys with similar structure)
 */
function isRecordType(value: any): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }
  
  // If all keys are non-standard property names (not typical object properties)
  // and the values have similar structure, it's likely a Record
  const firstValue = value[keys[0]];
  if (typeof firstValue === 'object' && firstValue !== null && !Array.isArray(firstValue)) {
    // Check if all values have similar structure (same keys)
    const firstKeys = Object.keys(firstValue).sort();
    return keys.every(key => {
      const val = value[key];
      if (typeof val !== 'object' || val === null || Array.isArray(val)) {
        return false;
      }
      const valKeys = Object.keys(val).sort();
      return firstKeys.length === valKeys.length && firstKeys.every((k, i) => k === valKeys[i]);
    });
  }
  
  return false;
}

/**
 * Detect actual changes between two states by comparing values
 */
function detectActualChanges(oldState: any, newState: any, parentPath: string[] = []): Array<{ path: string[]; value: any }> {
  const changes: Array<{ path: string[]; value: any }> = [];
  
  // Extract all paths from the new state
  const newPaths = extractPaths(newState, parentPath);
  
  // For each path in the new state, check if it's actually different
  for (const { path, value } of newPaths) {
    // Get the corresponding value from the old state
    let oldValue = oldState;
    let pathExists = true;
    
    for (const segment of path) {
      if (oldValue && typeof oldValue === 'object' && segment in oldValue) {
        oldValue = oldValue[segment];
      } else {
        pathExists = false;
        break;
      }
    }
    
    // If the path doesn't exist in old state or the value is different, it's a change
    if (!pathExists || !deepEqual(oldValue, value)) {
      changes.push({ path, value });
    }
  }
  
  return changes;
}

/**
 * Deep equality check for primitive values and objects
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  
  if (a == null || b == null) return a === b;
  
  if (typeof a !== typeof b) return false;
  
  if (typeof a !== 'object') return a === b;
  
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!(key in b)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  
  return true;
}

/**
 * Check if a value should be stored granularly (objects but not arrays)
 */
function shouldStoreGranularly(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
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
  private previousState: TState;

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
    
    // Initialize key manager
    this.keyManager = new StorageKeyManager(options.namespace);
    
    this.stateHydrator = new StateHydrator(this.client, this.logger, this.performanceMonitor, this.keyManager);
    this.syncQueueManager = new SyncQueueManager(this.logger, this.performanceMonitor);

    // Initialize previous state tracking
    this.previousState = { ...this.api.getState() };

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

      // Parse the storage key to determine the path
      const parsed = this.keyManager.parseStorageKey(event.key);

      // Get the current state to preserve existing nested properties
      const currentState = this.api.getState() as any;
      
      // Handle deletion or update
      if (event.value === null) {
        // For deletions, we need special handling for Record types
        let stateUpdate: any = {};
        let current = stateUpdate;
        let currentStateTraversal = currentState;
        
        // Build the path to the deletion point
        for (let i = 0; i < parsed.path.length - 1; i++) {
          const pathSegment = parsed.path[i];
          
          // If there's an existing nested object at this path, clone it
          if (currentStateTraversal && typeof currentStateTraversal[pathSegment] === 'object' && !Array.isArray(currentStateTraversal[pathSegment])) {
            current[pathSegment] = { ...currentStateTraversal[pathSegment] };
          } else {
            current[pathSegment] = {};
          }
          
          current = current[pathSegment];
          currentStateTraversal = currentStateTraversal?.[pathSegment];
        }
        
        const finalKey = parsed.path[parsed.path.length - 1];
        
        // For Record type deletions (depth >= 3), check if we should remove the entire parent object
        if (parsed.path.length >= 3) {
          // Delete the field from the current object
          delete current[finalKey];
          
          // Now check if the parent object (Record entry) is empty and should be removed
          const parentRecordKey = parsed.path[parsed.path.length - 2];
          const grandparentPath = parsed.path.slice(0, -2);
          
          // Get the parent object after the deletion
          let parentObject = current;
          if (Object.keys(parentObject).length === 0) {
            // Parent object is empty, remove it from the grandparent (the Record)
            // Navigate to the grandparent in the state update
            let grandparentInUpdate = stateUpdate;
            for (const segment of grandparentPath) {
              grandparentInUpdate = grandparentInUpdate[segment];
            }
            
            // Remove the empty parent object
            delete grandparentInUpdate[parentRecordKey];
          }
        } else if (parsed.path.length === 1) {
          // Top-level deletion - use initial state value or delete entirely
          if ((this.initialState as any)[parsed.path[0]] !== undefined) {
            stateUpdate[parsed.path[0]] = (this.initialState as any)[parsed.path[0]];
          } else {
            delete stateUpdate[parsed.path[0]];
          }
        } else {
          // Nested deletion - delete the property
          delete current[finalKey];
        }

        await this.applyStateChange(stateUpdate as Partial<TState>, false, true);
      } else {
        // For updates, reconstruct the state update from the path, preserving existing nested objects
        let stateUpdate: any = {};
        let current = stateUpdate;
        let currentStateTraversal = currentState;
        
        for (let i = 0; i < parsed.path.length - 1; i++) {
          const pathSegment = parsed.path[i];
          
          // If there's an existing nested object at this path, clone it
          if (currentStateTraversal && typeof currentStateTraversal[pathSegment] === 'object' && !Array.isArray(currentStateTraversal[pathSegment])) {
            current[pathSegment] = { ...currentStateTraversal[pathSegment] };
          } else {
            current[pathSegment] = {};
          }
          
          current = current[pathSegment];
          currentStateTraversal = currentStateTraversal?.[pathSegment];
        }
        
        current[parsed.path[parsed.path.length - 1]] = event.value;

        await this.applyStateChange(stateUpdate as Partial<TState>, false, true);
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
        this.updateMultiplayerState({ hasHydrated: false, isSubscriptionReady: false });
      }

      this.updateMultiplayerState({ connectionState: state });

      if (state === ConnectionState.CONNECTED) {
        await this.hydrate();
        // Update subscription ready status after hydration
        this.updateSubscriptionReadyStatus();
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
    partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>) | { changes: Partial<TState>; deletions: Array<{ path: string[] }> },
    replace?: boolean,
    isRemoteUpdate: boolean = false,
  ): Promise<void> {
    try {
      let nextState: TState | Partial<TState>;
      let deletions: Array<{ path: string[] }> = [];

      // Handle the new format with changes and deletions
      if (typeof partial === 'object' && partial !== null && 'changes' in partial && 'deletions' in partial) {
        nextState = partial.changes;
        deletions = partial.deletions;
      } else if (typeof partial === 'function') {
        nextState = (partial as (state: TState) => TState | Partial<TState>)(this.api.getState());
      } else {
        nextState = partial as TState | Partial<TState>;
      }

      if (replace === true) {
        this.api.setState(nextState as TState, true);
      } else {
        this.api.setState(nextState, false);
      }

      this.logger.debug(
        `Updated local state for '${JSON.stringify(nextState)}'`,
        { operation: 'state-change', clientId: this.client.getClientId() },
      );

      if (!isRemoteUpdate) {
        await this.syncStateToRemote(nextState as Partial<TState>, deletions);
      } else {
        // Update previous state tracking for remote updates
        this.previousState = { ...this.api.getState() };
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

  private async syncStateToRemote(state: Partial<TState>, deletions: Array<{ path: string[] }> = []): Promise<void> {
    const startTime = getCurrentTimestamp();

    // Add defensive check for undefined/null state
    if (!state || typeof state !== 'object') {
      this.logger.warn(`Attempted to sync undefined or null state: ${state}`, {
        operation: 'sync-state-to-remote',
      });
      return;
    }

    // Detect actual changes by comparing with previous state
    const actualChanges = detectActualChanges(this.previousState, state);
    
    // Filter out non-serializable entries
    const serializablePaths = actualChanges.filter(({ path, value }) => {
      // Skip the multiplayer state
      if (path[0] === 'multiplayer') {
        return false;
      }
      
      // Skip functions
      if (typeof value === 'function') {
        return false;
      }
      
      // Skip undefined values
      if (value === undefined) {
        return false;
      }
      
      return true;
    });

    // Process deletions that were passed in
    const deletionPromises: Promise<void>[] = [];
    
    for (const deletion of deletions) {
      const storageKey = this.keyManager.createStorageKey(deletion.path);
      
      this.logger.debug(
        `Deleting removed path '${deletion.path.join('.')}' with key '${storageKey}'`,
        {
          operation: 'delete-path',
          clientId: this.client.getClientId(),
        },
      );
      
      deletionPromises.push(
        this.client.setItem(storageKey, null).catch(error => {
          this.logger.error(
            `Failed to delete key '${storageKey}'`,
            normalizeError(error),
            { operation: 'delete-path', clientId: this.client.getClientId() },
          );
        })
      );
    }

    // Only proceed if there are serializable changes or deletions
    if (serializablePaths.length === 0 && deletionPromises.length === 0) {
      return;
    }

    // Sync all paths in parallel
    const syncPromises = serializablePaths.map(({ path, value }) => {
      const storageKey = this.keyManager.createStorageKey(path);
      
      this.logger.debug(
        `Syncing path '${path.join('.')}' with key '${storageKey}'`,
        {
          operation: 'sync-path',
          clientId: this.client.getClientId(),
        },
      );
      
      return this.client.setItem(storageKey, value);
    });

    // Wait for both sync and deletion operations to complete
    await Promise.all([...syncPromises, ...deletionPromises]);

    // Update previous state tracking
    this.previousState = { ...this.api.getState() };

    const duration = getCurrentTimestamp() - startTime;
    this.performanceMonitor.recordSyncTime(duration);
  }

  handleStateChangeRequest(
    partial: TState | Partial<TState> | ((state: TState) => TState | Partial<TState>) | { changes: Partial<TState>; deletions: Array<{ path: string[] }> },
    replace?: boolean,
  ): void {
    const connectionState = this.connectionManager.getConnectionState();
    const isHydrated = this.stateHydrator.getHydrationStatus();

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
            normalizeError(error),
            { operation: 'auto-hydration' },
          );
        });
      }
      return;
    }

    this.applyStateChange(partial, replace, false).catch(error => {
      this.logger.error(
        'Error applying local state change',
        normalizeError(error),
        { operation: 'state-change' },
      );
    });
  }

  private updateMultiplayerState(updates: Partial<MultiplayerState<TState>>): void {
    this.api.setState(
      state => ({
        ...state,
        multiplayer: { ...(state as any).multiplayer, ...updates },
      }),
      false,
    );
  }

  private updateSubscriptionReadyStatus(): void {
    const isReady = this.client.isSubscriptionReady();
    this.updateMultiplayerState({ isSubscriptionReady: isReady });
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
          normalizeError(error),
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
  U = T & { multiplayer: MultiplayerState<T> },
>(
  initializer: ImmerStateCreator<T, [...Mps, ['zustand/multiplayer', unknown]], Mcs, T>,
  options: MultiplayerOptions<T>,
) => StateCreator<U, Mps, [['zustand/multiplayer', U], ...Mcs]>;

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    'zustand/multiplayer': WithMultiplayerMiddleware<S, A>;
  }
}

type MultiplayerMiddleware = <TState>(
  config: ImmerStateCreator<TState, [], [], TState>,
  options: MultiplayerOptions<TState>,
) => StateCreator<TState & { multiplayer: MultiplayerState<TState> }, [], []>;

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
  type TStateWithMultiplayer = TState & { multiplayer: MultiplayerState<TState> };

  // Store the original setState function for the orchestrator
  const originalSetState = api.setState;
  
  // Create a placeholder orchestrator that will be initialized later
  let orchestrator: MultiplayerOrchestrator<TState>;

  // Create the real store with the intercepted set function
  const interceptedSet = <A extends TState | Partial<TState> | ((state: TState) => TState | Partial<TState>) | ((state: Draft<TState>) => void)>(
    partial: A,
    replace?: boolean,
  ) => {
    // If orchestrator is not initialized yet, just apply the state change directly
    if (!orchestrator) {
      if (replace === true) {
        set(partial as TState & { multiplayer: MultiplayerState<TState> }, true);
      } else {
        set(partial as Partial<TState & { multiplayer: MultiplayerState<TState> }>, false);
      }
      return;
    }

    // Handle different types of updates
    if (typeof partial === 'function') {
      // Check if it's an immer-style function by looking at its parameter signature
      const funcString = partial.toString();
      if (funcString.includes('draft') || funcString.includes('=>')) {
        // This is an immer-style function - apply it with produce and compute diff
        const oldState = get() as TState;
        const nextState = produce(oldState, partial as (state: Draft<TState>) => void);
        
        // Compute the diff to get only the changes
        const changes: Partial<TState> = {};
        for (const key in nextState) {
          if (nextState[key] !== oldState[key]) {
            changes[key] = nextState[key];
          }
        }
        
        // Detect granular deletions for each changed field
        const deletions: Array<{ path: string[]; }> = [];
        for (const [field, newValue] of Object.entries(changes)) {
          if (field === 'multiplayer' || typeof newValue === 'function') {
            continue;
          }
          
          // Check if this field supports granular storage (objects but not arrays)
          if (shouldStoreGranularly(newValue)) {
            // Get the old value for this field
            const oldFieldValue = (oldState as any)[field];
            
            // If the old field also supports granular storage, check for deletions
            if (shouldStoreGranularly(oldFieldValue)) {
              const oldPaths = extractPaths({ [field]: oldFieldValue });
              const newPaths = extractPaths({ [field]: newValue });
              
              // Create sets of path strings for comparison
              const oldPathSet = new Set(oldPaths.map(p => p.path.join(':')));
              const newPathSet = new Set(newPaths.map(p => p.path.join(':')));
              
              // Find paths that exist in old but not in new (deletions)
              const deletedPaths = Array.from(oldPathSet).filter(path => {
                if (newPathSet.has(path)) {
                  return false; // Not deleted
                }
                
                // Check if this is a parent path of any new path
                // If so, it's transitioning from leaf to granular storage, not truly deleted
                const pathPrefix = path + ':';
                for (const newPath of newPathSet) {
                  if (newPath.startsWith(pathPrefix)) {
                    return false; // This is a parent of a new granular path
                  }
                }
                
                return true; // Truly deleted
              });
              
              // Add to deletions list
              for (const deletedPath of deletedPaths) {
                const pathSegments = deletedPath.split(':');
                deletions.push({ path: pathSegments });
              }
            }
          }
        }
        
        // Pass both changes and deletions to the orchestrator
        orchestrator.handleStateChangeRequest({ changes, deletions } as any, replace);
      } else {
        // This is a regular zustand function - pass it through
        orchestrator.handleStateChangeRequest(partial as (state: TState) => TState | Partial<TState>, replace);
      }
    } else {
      // Handle non-function updates (objects)
      orchestrator.handleStateChangeRequest(partial as TState | Partial<TState>, replace);
    }
  };

  // Replace the api.setState with the intercepted version for the final store
  api.setState = interceptedSet;

  // Create a wrapped API that provides the enhanced set function
  const wrappedApi = {
    setState: interceptedSet,
    getState: () => get() as TState,
    subscribe: api.subscribe,
  };

  const store = config(interceptedSet, () => get() as TState, wrappedApi);

  // Now get the initial state from the store
  const initialState = (get() || store) as Record<string, unknown>;
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

  // Build subscription patterns based on subscribeToUpdatesFor configuration
  const subscribedFields = syncOptions.subscribeToUpdatesFor!();
  const pathPatterns = new Set<string>();
  
  // For each subscribed field, add the field itself and wildcard pattern for nested values
  subscribedFields.forEach(key => {
    const keyStr = String(key);
    pathPatterns.add(keyStr); // Add the field itself
    pathPatterns.add(`${keyStr}:*`); // Add wildcard for all nested values
  });

  const subscribedKeysArray = Array.from(pathPatterns);
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

  // Create a modified API for the orchestrator that uses the original setState
  // This prevents circular dependencies
  const orchestratorApi = {
    ...api,
    setState: originalSetState,
  };

  // Now initialize the orchestrator with the original setState
  orchestrator = new MultiplayerOrchestrator(client, syncOptions, orchestratorApi as any, store);

      const multiplayerState: MultiplayerState<TState> = {
      connectionState: ConnectionState.DISCONNECTED,
      hasHydrated: false,
      isSubscriptionReady: false,
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
 * Enhanced Zustand Multiplayer Middleware with Unified Granular Storage
 *
 * @example Basic Usage with Automatic Granular Storage
 * ```typescript
 * interface AppState {
 *   user: { 
 *     name: string; 
 *     email: string;
 *     settings: {
 *       theme: string;
 *       notifications: boolean;
 *     }
 *   };
 *   todos: Record<string, Todo>;  // Granular storage for dictionary
 *   items: string[];              // Arrays stored as single value
 *   count: number;
 * }
 *
 * const useAppStore = create(
 *   multiplayer(
 *     (set, get) => ({
 *       user: { 
 *         name: '', 
 *         email: '',
 *         settings: { theme: 'light', notifications: true }
 *       },
 *       todos: {},
 *       items: [],
 *       count: 0,
 *
 *       // Immer-style updates work seamlessly
 *       updateUserName: (name: string) => set(draft => {
 *         draft.user.name = name; // Stored as 'namespace:user:name'
 *       }),
 *
 *       updateTheme: (theme: string) => set(draft => {
 *         draft.user.settings.theme = theme; // Stored as 'namespace:user:settings:theme'
 *       }),
 *
 *       addTodo: (todo: Todo) => set(draft => {
 *         draft.todos[todo.id] = todo; // Stored as 'namespace:todos:${todo.id}'
 *       }),
 *
 *       addItem: (item: string) => set(draft => {
 *         draft.items.push(item); // Entire array stored as 'namespace:items'
 *       }),
 *     }),
 *     {
 *       namespace: 'my-app',
 *       apiBaseUrl: 'https://api.hpkv.io',
 *       apiKey: 'your-api-key',
 *     }
 *   )
 * );
 * ```
 *
 * @example Benefits of Unified Granular Storage:
 * 1. **Reduced Conflicts**: Different parts of nested objects can be updated independently
 * 2. **Better Performance**: Only changed leaf values are synced
 * 3. **Natural Immer Integration**: Works perfectly with draft mutations
 * 4. **Automatic**: No configuration needed - all objects stored granularly
 * 5. **Arrays as Primitives**: Arrays are stored as single values for consistency
 */
