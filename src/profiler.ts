export interface PerformanceMetrics {
  stateChangesProcessed: number;
  averageHydrationTime: number;
  averageSyncTime: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    stateChangesProcessed: 0,
    averageHydrationTime: 0,
    averageSyncTime: 0,
  };

  private hydrationTimes: number[] = [];
  private syncTimes: number[] = [];

  constructor(private enabled: boolean) {}

  recordStateChange(): void {
    if (!this.enabled) return;
    this.metrics.stateChangesProcessed++;
  }

  recordHydrationTime(duration: number): void {
    if (!this.enabled) return;
    this.hydrationTimes.push(duration);
    if (this.hydrationTimes.length > 100) {
      this.hydrationTimes.shift();
    }
    this.metrics.averageHydrationTime =
      this.hydrationTimes.length > 0
        ? this.hydrationTimes.reduce((sum, time) => sum + time, 0) / this.hydrationTimes.length
        : 0;
  }

  recordSyncTime(duration: number): void {
    if (!this.enabled) return;
    this.syncTimes.push(duration);
    if (this.syncTimes.length > 100) {
      this.syncTimes.shift();
    }
    this.metrics.averageSyncTime =
      this.syncTimes.length > 0
        ? this.syncTimes.reduce((sum, time) => sum + time, 0) / this.syncTimes.length
        : 0;
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}
