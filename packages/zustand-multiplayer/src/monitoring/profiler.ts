import { MAX_OPERATION_HISTORY } from '../utils/constants';

export interface PerformanceMetrics {
  averageSyncTime: number;
}

export class PerformanceMonitor {
  private readonly metrics: PerformanceMetrics = {
    averageSyncTime: 0,
  };
  private readonly syncTimes: number[] = [];

  recordSyncTime(duration: number): void {
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
    this.syncTimes.length = 0;
    this.metrics.averageSyncTime = 0;
  }
}
