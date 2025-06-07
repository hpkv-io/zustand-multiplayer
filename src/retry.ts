import { Logger } from './logger';

// ============================================================================
// RETRY CONFIGURATION TYPES
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

// ============================================================================
// ERROR HANDLING SYSTEM
// ============================================================================

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class CircuitBreakerError extends RetryableError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CIRCUIT_BREAKER_OPEN', false, context);
  }
}

export class MaxRetriesExceededError extends RetryableError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MAX_RETRIES_EXCEEDED', true, context);
  }
}

// ============================================================================
// RETRY LOGIC WITH CIRCUIT BREAKER
// ============================================================================

export class RetryManager {
  private failureCount = 0;
  private lastFailureTime = 0;
  private circuitBreakerOpen = false;

  constructor(
    private config: RetryConfig,
    private logger: Logger,
  ) {}

  async executeWithRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    if (this.circuitBreakerOpen) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure < this.config.maxDelay) {
        throw new CircuitBreakerError(`Circuit breaker open for ${operationName}`, {
          operationName,
          timeSinceLastFailure,
        });
      }
      this.circuitBreakerOpen = false;
      this.failureCount = 0;
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await operation();
        this.failureCount = 0;
        this.circuitBreakerOpen = false;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.failureCount++;
        this.lastFailureTime = Date.now();

        this.logger.warn(
          `${operationName} failed (attempt ${attempt + 1}/${this.config.maxRetries + 1})`,
          { operation: operationName },
        );

        if (attempt === this.config.maxRetries) {
          this.circuitBreakerOpen = this.failureCount >= 3;
          break;
        }

        const delay = Math.min(
          this.config.baseDelay * Math.pow(this.config.backoffFactor, attempt),
          this.config.maxDelay,
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new MaxRetriesExceededError(
      `${operationName} failed after ${this.config.maxRetries + 1} attempts`,
      {
        operationName,
        attempts: this.config.maxRetries + 1,
        lastError: lastError?.message,
      },
    );
  }

  /**
   * Resets the circuit breaker state
   */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.circuitBreakerOpen = false;
    this.logger.debug('Retry manager state reset');
  }

  /**
   * Gets current retry statistics
   */
  getStats(): { failureCount: number; circuitBreakerOpen: boolean; lastFailureTime: number } {
    return {
      failureCount: this.failureCount,
      circuitBreakerOpen: this.circuitBreakerOpen,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a default retry configuration
 */
export function createDefaultRetryConfig(): RetryConfig {
  return {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
  };
}

/**
 * Creates a RetryManager with default configuration
 */
export function createRetryManager(logger: Logger, config?: Partial<RetryConfig>): RetryManager {
  const fullConfig = { ...createDefaultRetryConfig(), ...config };
  return new RetryManager(fullConfig, logger);
}
