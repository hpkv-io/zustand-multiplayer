import type { Logger } from '../monitoring/logger';
import { HydrationError } from '../types/multiplayer-types';
import { normalizeError, getCurrentTimestamp, generateId } from '../utils';
import { MAX_PENDING_CHANGES } from '../utils/constants';
import type { StateChange } from './conflict-resolver';

// ============================================================================
// Sync Queue Manager
// ============================================================================

export class SyncQueueManager<TState> {
  private pendingChanges: StateChange<TState>[] = [];
  private isProcessing = false;

  constructor(private readonly logger: Logger) {}

  addPendingChange(change: Omit<StateChange<TState>, 'timestamp' | 'id'>): void {
    // Check if we've reached the maximum number of pending changes
    if (this.pendingChanges.length >= MAX_PENDING_CHANGES) {
      this.logger.warn('Maximum pending changes reached, dropping oldest change', {
        operation: 'sync-queue-add',
        queueSize: this.pendingChanges.length,
        maxChanges: MAX_PENDING_CHANGES,
      });

      // Remove the oldest change to make room
      this.pendingChanges.shift();
    }

    const fullChange: StateChange<TState> = {
      ...change,
      timestamp: getCurrentTimestamp(),
      id: generateId(),
    };

    this.logger.debug('Adding change to offline queue', {
      operation: 'sync-queue-add',
      changeId: fullChange.id,
      queueSize: this.pendingChanges.length + 1,
      isFunction: typeof change.partial === 'function',
    });

    this.pendingChanges.push(fullChange);
  }

  getPendingChanges(): StateChange<TState>[] {
    return [...this.pendingChanges];
  }

  clearPendingChanges(): void {
    this.pendingChanges = [];
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

    this.logger.debug('Starting to process offline change queue', {
      operation: 'sync-queue-start',
      changeCount: this.pendingChanges.length,
    });

    try {
      const changesToProcess = [...this.pendingChanges];
      this.pendingChanges = [];

      for (const change of changesToProcess) {
        this.logger.debug('Processing queued state change', {
          operation: 'sync-queue-process',
          changeId: change.id,
          age: getCurrentTimestamp() - change.timestamp,
          isFunction: typeof change.partial === 'function',
        });
        await applyStateChange(change.partial, change.replace);
      }
    } catch (error) {
      this.logger.error('Error processing offline changes', normalizeError(error), {
        operation: 'sync-queue',
      });
      throw new HydrationError('Error processing offline changes', {
        operation: 'sync-queue',
      });
    } finally {
      this.isProcessing = false;
    }
  }
}
