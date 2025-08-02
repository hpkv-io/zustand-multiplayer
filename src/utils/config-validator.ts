import { ConfigurationError } from '../types/multiplayer-types';
import type { MultiplayerOptions } from '../types/multiplayer-types';
import { MIN_Z_FACTOR, MAX_Z_FACTOR, DEFAULT_Z_FACTOR } from './constants';

// ============================================================================
// CONFIGURATION VALIDATION UTILITIES
// ============================================================================

/**
 * Validation result with detailed error information
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Configuration validation options
 */
export interface ValidationOptions {
  strict?: boolean;
  allowMissingOptional?: boolean;
}

/**
 * Validates that required authentication options are provided
 */
export function validateAuthenticationOptions<T>(options: MultiplayerOptions<T>): void {
  if (!options.apiKey && !options.tokenGenerationUrl) {
    throw new ConfigurationError(
      'Either apiKey or tokenGenerationUrl must be provided for authentication',
      {
        apiKey: options.apiKey,
        tokenGenerationUrl: options.tokenGenerationUrl,
        operation: 'authentication-validation',
      },
    );
  }
}

/**
 * Validates namespace configuration
 */
export function validateNamespace(namespace: string): void {
  if (!namespace || typeof namespace !== 'string') {
    throw new ConfigurationError('Namespace must be a non-empty string', {
      namespace,
      operation: 'namespace-validation',
    });
  }

  if (namespace.length < 1 || namespace.length > 100) {
    throw new ConfigurationError('Namespace must be between 1 and 100 characters', {
      namespace,
      length: namespace.length,
      operation: 'namespace-validation',
    });
  }

  const invalidChars = /[^a-zA-Z0-9_-]/;
  if (invalidChars.test(namespace)) {
    throw new ConfigurationError(
      'Namespace can only contain alphanumeric characters, underscores, and hyphens',
      {
        namespace,
        operation: 'namespace-validation',
      },
    );
  }
}

/**
 * Validates API base URL
 */
export function validateApiBaseUrl(apiBaseUrl: string): void {
  if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
    throw new ConfigurationError('API base URL must be a non-empty string', {
      apiBaseUrl,
      operation: 'api-url-validation',
    });
  }

  try {
    const url = new URL(apiBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new ConfigurationError('API base URL must use HTTP or HTTPS protocol', {
        apiBaseUrl,
        protocol: url.protocol,
        operation: 'api-url-validation',
      });
    }
  } catch (error) {
    throw new ConfigurationError('Invalid API base URL format', {
      apiBaseUrl,
      error: error instanceof Error ? error.message : String(error),
      operation: 'api-url-validation',
    });
  }
}

/**
 * Validates Z-factor configuration
 */
export function validateZFactor(zFactor?: number): number {
  if (zFactor === undefined || zFactor === null) {
    return DEFAULT_Z_FACTOR;
  }

  if (typeof zFactor !== 'number' || !Number.isInteger(zFactor)) {
    throw new ConfigurationError('Z-factor must be an integer', {
      zFactor,
      type: typeof zFactor,
      operation: 'z-factor-validation',
    });
  }

  if (zFactor < MIN_Z_FACTOR || zFactor > MAX_Z_FACTOR) {
    throw new ConfigurationError(`Z-factor must be between ${MIN_Z_FACTOR} and ${MAX_Z_FACTOR}`, {
      zFactor,
      min: MIN_Z_FACTOR,
      max: MAX_Z_FACTOR,
      operation: 'z-factor-validation',
    });
  }

  return zFactor;
}

/**
 * Validates function arrays for subscribe/publish operations
 */
export function validateFunctionArrays<T>(
  publishUpdatesFor?: () => Array<keyof T>,
  subscribeToUpdatesFor?: () => Array<keyof T>,
): void {
  if (publishUpdatesFor && typeof publishUpdatesFor !== 'function') {
    throw new ConfigurationError('publishUpdatesFor must be a function', {
      type: typeof publishUpdatesFor,
      operation: 'function-validation',
    });
  }

  if (subscribeToUpdatesFor && typeof subscribeToUpdatesFor !== 'function') {
    throw new ConfigurationError('subscribeToUpdatesFor must be a function', {
      type: typeof subscribeToUpdatesFor,
      operation: 'function-validation',
    });
  }

  // Validate that functions return arrays (can only be checked at runtime)
  if (publishUpdatesFor) {
    try {
      const result = publishUpdatesFor();
      if (!Array.isArray(result)) {
        throw new ConfigurationError('publishUpdatesFor must return an array', {
          returnType: typeof result,
          operation: 'function-validation',
        });
      }
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      throw new ConfigurationError('Error executing publishUpdatesFor function', {
        error: error instanceof Error ? error.message : String(error),
        operation: 'function-validation',
      });
    }
  }

  if (subscribeToUpdatesFor) {
    try {
      const result = subscribeToUpdatesFor();
      if (!Array.isArray(result)) {
        throw new ConfigurationError('subscribeToUpdatesFor must return an array', {
          returnType: typeof result,
          operation: 'function-validation',
        });
      }
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      throw new ConfigurationError('Error executing subscribeToUpdatesFor function', {
        error: error instanceof Error ? error.message : String(error),
        operation: 'function-validation',
      });
    }
  }
}

/**
 * Comprehensive validation of all multiplayer options
 */
export function validateMultiplayerOptions<T>(
  options: MultiplayerOptions<T>,
  validationOptions: ValidationOptions = {},
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    validateAuthenticationOptions(options);
    validateNamespace(options.namespace);
    validateApiBaseUrl(options.apiBaseUrl);
    validateFunctionArrays(options.publishUpdatesFor, options.subscribeToUpdatesFor);
    options.zFactor = validateZFactor(options.zFactor);

    if (options.profiling === true && !validationOptions.strict) {
      warnings.push('Profiling is enabled, which may impact performance in production');
    }
  } catch (error) {
    if (error instanceof ConfigurationError) {
      errors.push(error.message);
    } else {
      errors.push(
        `Unexpected validation error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates multiplayer options, throwing on validation failure
 */
export function validateOptions<T>(
  options: MultiplayerOptions<T>,
  validationOptions: ValidationOptions = {},
): MultiplayerOptions<T> {
  const result = validateMultiplayerOptions(options, validationOptions);

  if (!result.isValid) {
    throw new ConfigurationError(`Configuration validation failed: ${result.errors.join(', ')}`, {
      errors: result.errors,
      warnings: result.warnings,
      operation: 'options-validation',
    });
  }

  if (result.warnings.length > 0 && typeof console !== 'undefined') {
    console.warn('Zustand Multiplayer Configuration Warnings:', result.warnings);
  }

  return options;
}
