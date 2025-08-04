import type { MultiplayerOptions } from '../types/multiplayer-types';
import { MIN_Z_FACTOR, MAX_Z_FACTOR, DEFAULT_Z_FACTOR } from './constants';
import { normalizeError } from '.';

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
 * Validates that required authentication options are provided
 */
export function validateAuthenticationOptions<T>(options: MultiplayerOptions<T>): void {
  if (!options.apiKey && !options.tokenGenerationUrl) {
    throw new Error('Either apiKey or tokenGenerationUrl must be provided for authentication');
  }
}

/**
 * Validates namespace configuration
 */
export function validateNamespace(namespace: string): void {
  if (!namespace || typeof namespace !== 'string') {
    throw new Error('Namespace must be a non-empty string');
  }

  if (namespace.length < 1 || namespace.length > 100) {
    throw new Error('Namespace must be between 1 and 100 characters');
  }

  const invalidChars = /[^a-zA-Z0-9_-]/;
  if (invalidChars.test(namespace)) {
    throw new Error('Namespace can only contain alphanumeric characters, underscores, and hyphens');
  }
}

/**
 * Validates API base URL
 */
export function validateApiBaseUrl(apiBaseUrl: string): void {
  if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
    throw new Error('API base URL must be a non-empty string');
  }

  try {
    const url = new URL(apiBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('API base URL must use HTTP or HTTPS protocol');
    }
  } catch (error) {
    throw new Error(`Invalid API base URL format : ${normalizeError(error).message}`);
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
    throw new Error('Z-factor must be an integer');
  }

  if (zFactor < MIN_Z_FACTOR || zFactor > MAX_Z_FACTOR) {
    throw new Error(`Z-factor must be between ${MIN_Z_FACTOR} and ${MAX_Z_FACTOR}`);
  }

  return zFactor;
}

/**
 * Validates the sync array option
 */
export function validateSyncArray<T>(sync?: Array<keyof T>): void {
  if (sync && !Array.isArray(sync)) {
    throw new Error('sync must be an array');
  }
}

/**
 * Comprehensive validation of all multiplayer options
 */
export function validateMultiplayerOptions<T>(options: MultiplayerOptions<T>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    validateAuthenticationOptions(options);
    validateNamespace(options.namespace);
    validateApiBaseUrl(options.apiBaseUrl);
    validateSyncArray(options.sync);
    options.zFactor = validateZFactor(options.zFactor);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
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
export function validateOptions<T>(options: MultiplayerOptions<T>): MultiplayerOptions<T> {
  const result = validateMultiplayerOptions(options);

  if (!result.isValid) {
    throw new Error(`Configuration validation failed: ${result.errors.join(', ')}`);
  }

  if (result.warnings.length > 0 && typeof console !== 'undefined') {
    console.warn('Zustand Multiplayer Configuration Warnings:', result.warnings);
  }

  return options;
}
