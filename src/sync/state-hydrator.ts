import { Logger } from '../monitoring/logger';
import { PerformanceMonitor } from '../monitoring/profiler';
import { HPKVStorage } from '../storage/hpkv-storage';
import { StorageKeyManager } from '../storage/storage-key-manager';
import { HydrationError } from '../types/multiplayer-types';
import { normalizeError, getCurrentTimestamp, isPlainObject } from '../utils';
import { createMemoizedStateReconstruction } from '../utils/memoization';
import { PathManager, fromLegacyPath } from '../utils/path-manager';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Type for state during reconstruction
 */
type StateReconstruction = Record<string, unknown>;

/**
 * Type guard to check if a value is a valid state object
 */
function isValidStateObject(value: unknown): value is StateReconstruction {
  return isPlainObject(value);
}

/**
 * Safely merges nested paths into a state object using PathManager
 */
function setNestedPath(target: StateReconstruction, path: string[], value: unknown): void {
  const statePath = fromLegacyPath(path);
  PathManager.setValue(target, statePath, value);
}

// ============================================================================
// STATE HYDRATOR
// ============================================================================

export class StateHydrator<TState> {
  private isHydrating = false;
  private hydrationPromise: Promise<void> | null = null;
  private hasHydrated = false;

  // Memoized state reconstruction for better performance
  private memoizedStateReconstruction: (items: Map<string, unknown>) => Partial<TState>;

  constructor(
    private client: HPKVStorage,
    private logger: Logger,
    private performanceMonitor: PerformanceMonitor,
    private keyManager: StorageKeyManager,
  ) {
    // Create memoized version of state reconstruction
    this.memoizedStateReconstruction = createMemoizedStateReconstruction(
      this.reconstructStateFromItems.bind(this),
    );
  }

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

    this.logger.info('Starting hydration', {
      operation: 'hydration',
      clientId: this.client.getClientId(),
    });
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

      // Reconstruct the state from granular storage using memoized version
      const reconstructedState = this.memoizedStateReconstruction(allItems);

      // Safely invoke onHydrate callback
      this.invokeOnHydrateCallback(reconstructedState, onHydrate);

      // Apply the reconstructed state
      await applyStateChange(reconstructedState, false, true);

      this.hasHydrated = true;
      this.recordHydrationMetrics(startTime);

      this.logger.info(`Hydrated state from database`, { operation: 'hydration' });
    } catch (error) {
      this.logger.error('Hydration failed', normalizeError(error), { operation: 'hydration' });

      throw new HydrationError('Failed to hydrate state', {
        error: normalizeError(error).message,
      });
    }
  }

  private reconstructStateFromItems(allItems: Map<string, unknown>): Partial<TState> {
    const reconstructedState: StateReconstruction = {};

    for (const [key, value] of allItems.entries()) {
      const parsed = this.keyManager.parseStorageKey(key);

      if (parsed.path.length === 1) {
        // Top-level field
        reconstructedState[parsed.path[0]] = value;
      } else {
        // Nested field - reconstruct the object hierarchy
        setNestedPath(reconstructedState, parsed.path, value);
      }
    }

    return reconstructedState as Partial<TState>;
  }

  private invokeOnHydrateCallback(
    reconstructedState: Partial<TState>,
    onHydrate?: (state: TState) => void,
  ): void {
    if (onHydrate) {
      try {
        onHydrate(reconstructedState as TState);
      } catch (error) {
        this.logger.error('Error in onHydrate callback', normalizeError(error), {
          operation: 'hydration',
        });
      }
    }
  }

  private recordHydrationMetrics(startTime?: number): void {
    if (startTime) {
      const duration = getCurrentTimestamp() - startTime;
      this.performanceMonitor.recordHydrationTime(duration);
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
