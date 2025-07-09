import { Logger } from '../monitoring/logger';
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
      this.logger.error('Error processing offline changes', normalizeError(error), {
        operation: 'sync-queue',
      });
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }
}
