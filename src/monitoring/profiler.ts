import { MAX_OPERATION_HISTORY } from '../utils/constants';

export interface PerformanceMetrics {
  stateChangesProcessed: number;
  averageHydrationTime: number;
  averageSyncTime: number;
}

export class PerformanceMonitor {
  private readonly metrics: PerformanceMetrics = {
    stateChangesProcessed: 0,
    averageHydrationTime: 0,
    averageSyncTime: 0,
  };

  private readonly hydrationTimes: number[] = [];
  private readonly syncTimes: number[] = [];

  constructor(private readonly enabled: boolean) {}

  recordStateChange(): void {
    if (!this.enabled) return;
    this.metrics.stateChangesProcessed++;
  }

  recordHydrationTime(duration: number): void {
    if (!this.enabled) return;
    this.hydrationTimes.push(duration);
    if (this.hydrationTimes.length > MAX_OPERATION_HISTORY) {
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
    if (this.syncTimes.length > MAX_OPERATION_HISTORY) {
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

  /**
   * Cleanup performance monitoring data
   */
  cleanup(): void {
    this.hydrationTimes.length = 0;
    this.syncTimes.length = 0;
    this.metrics.stateChangesProcessed = 0;
    this.metrics.averageHydrationTime = 0;
    this.metrics.averageSyncTime = 0;
  }
}
