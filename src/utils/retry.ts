import {
  DEFAULT_BACKOFF_FACTOR,
  DEFAULT_RETRY_DELAY,
  DEFAULT_TIMEOUT,
  MAX_RETRY_ATTEMPTS,
} from './constants';
import { createDelay } from '.';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

export class RetryManager {
  constructor(private readonly config: RetryConfig) {}

  async executeWithRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.config.maxRetries) {
          break;
        }

        const delay = Math.min(
          this.config.baseDelay * Math.pow(this.config.backoffFactor, attempt),
          this.config.maxDelay,
        );

        await createDelay(delay);
      }
    }

    throw lastError ?? new Error(`${operationName} failed`);
  }
}

export function createDefaultRetryConfig(): RetryConfig {
  return {
    maxRetries: MAX_RETRY_ATTEMPTS,
    baseDelay: DEFAULT_RETRY_DELAY,
    maxDelay: DEFAULT_TIMEOUT,
    backoffFactor: DEFAULT_BACKOFF_FACTOR,
  };
}

export function createRetryManager(config?: Partial<RetryConfig>): RetryManager {
  const fullConfig = { ...createDefaultRetryConfig(), ...config };
  return new RetryManager(fullConfig);
}
