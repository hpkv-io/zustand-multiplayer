export interface OperationTracker {
  trackOperation<T>(operation: Promise<T>): Promise<T>;
  waitForOperations(timeoutMs?: number): Promise<void>;
  getPendingOperationCount(): number;
}

export class OperationTrackerImpl implements OperationTracker {
  private readonly runningOperations: Set<Promise<unknown>> = new Set();

  public trackOperation<T>(operation: Promise<T>): Promise<T> {
    this.runningOperations.add(operation);

    const cleanup = () => {
      this.runningOperations.delete(operation);
    };

    operation.then(cleanup, cleanup); // Ensure cleanup on both resolve and reject
    return operation;
  }

  public async waitForOperations(timeoutMs: number = 5000): Promise<void> {
    if (this.runningOperations.size === 0) {
      return;
    }

    const operationsPromise = Promise.allSettled(Array.from(this.runningOperations));
    const timeoutPromise = new Promise<void>(resolve =>
      setTimeout(() => {
        resolve();
      }, timeoutMs),
    );

    await Promise.race([operationsPromise, timeoutPromise]);
  }

  public getPendingOperationCount(): number {
    return this.runningOperations.size;
  }
}

export function createOperationTracker(): OperationTracker {
  return new OperationTrackerImpl();
}
