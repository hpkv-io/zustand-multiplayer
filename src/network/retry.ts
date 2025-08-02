import type { Logger } from '../monitoring/logger';
import type { ErrorContext } from '../types/multiplayer-types';
import { normalizeError, createDelay, getCurrentTimestamp } from '../utils';
import {
  DEFAULT_BACKOFF_FACTOR,
  DEFAULT_RETRY_DELAY,
  DEFAULT_TIMEOUT,
  MAX_RETRY_ATTEMPTS,
} from '../utils/constants';

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
// ERROR HANDLING TYPES
// ============================================================================

/**
 * Error handler function type
 */
export type ErrorHandler = (error: unknown, context: ErrorContext) => void;

// ============================================================================
// ERROR HANDLING SYSTEM
// ============================================================================

class RetryableError extends Error {
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

class CircuitBreakerError extends RetryableError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CIRCUIT_BREAKER_OPEN', false, context);
  }
}

class MaxRetriesExceededError extends RetryableError {
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
    private readonly config: RetryConfig,
    private readonly logger: Logger,
  ) {}

  async executeWithRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    if (this.circuitBreakerOpen) {
      const timeSinceLastFailure = getCurrentTimestamp() - this.lastFailureTime;
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
        lastError = normalizeError(error);
        this.failureCount++;
        this.lastFailureTime = getCurrentTimestamp();

        this.logger.warn(
          `${operationName} failed (attempt ${attempt + 1}/${this.config.maxRetries + 1}) : ${lastError?.message}`,
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

        await createDelay(delay);
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
    this.logger.debug('Retry manager state reset', {
      operation: 'retry-reset',
      previousFailures: this.failureCount,
    });
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
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Creates a standardized error handler with logging
 */
export function createErrorHandler(logger: Logger): ErrorHandler {
  return (error: unknown, context: ErrorContext) => {
    const operation = context.operation ?? 'unknown-operation';
    logger.error(`Failed operation: ${operation}`, normalizeError(error), context);
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a default retry configuration
 */
export function createDefaultRetryConfig(): RetryConfig {
  return {
    maxRetries: MAX_RETRY_ATTEMPTS,
    baseDelay: DEFAULT_RETRY_DELAY,
    maxDelay: DEFAULT_TIMEOUT,
    backoffFactor: DEFAULT_BACKOFF_FACTOR,
  };
}

/**
 * Creates a RetryManager with default configuration
 */
export function createRetryManager(logger: Logger, config?: Partial<RetryConfig>): RetryManager {
  const fullConfig = { ...createDefaultRetryConfig(), ...config };
  return new RetryManager(fullConfig, logger);
}
