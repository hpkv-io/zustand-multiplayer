import { Logger } from '../monitoring/logger';
import { HydrationError } from '../types/multiplayer-types';
import { normalizeError, getCurrentTimestamp, generateId } from '../utils';
import { StateChange } from './conflict-resolver';

// ============================================================================
// Sync Queue Manager
// ============================================================================

export class SyncQueueManager<TState> {
  private pendingChanges: StateChange<TState>[] = [];
  private isProcessing = false;

  constructor(private logger: Logger) {}

  addPendingChange(change: Omit<StateChange<TState>, 'timestamp' | 'id'>): void {
    const fullChange: StateChange<TState> = {
      ...change,
      timestamp: getCurrentTimestamp(),
      id: generateId(),
    };
    this.logger.debug(`Adding pending change : ${JSON.stringify(fullChange)}`, {
      operation: 'sync-queue',
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

    try {
      const changesToProcess = [...this.pendingChanges];
      this.pendingChanges = [];

      for (const change of changesToProcess) {
        this.logger.debug(`Processing change : ${JSON.stringify(change)}`, {
          operation: 'sync-queue',
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
