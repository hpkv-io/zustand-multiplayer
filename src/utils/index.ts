// ============================================================================
// CORE UTILITIES
// ============================================================================

/**
 * Generates a unique identifier with timestamp and random component
 * @returns A unique string identifier
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generates a cryptographically secure unique client identifier
 * @returns A unique client identifier string
 */
export function generateClientId(): string {
  // Use crypto.getRandomValues for better security if available
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const randomString = Array.from(array, byte => byte.toString(36))
      .join('')
      .substring(0, 15);
    return `client_${Date.now()}_${randomString}`;
  }

  // Fallback to Math.random with warning
  console.warn(
    'Using less secure Math.random for client ID generation. Consider using a secure environment.',
  );
  return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Normalizes an error to ensure it's an Error instance
 * @param error The error to normalize
 * @returns A normalized Error instance
 */
export function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Gets the current timestamp in milliseconds
 * @returns Current timestamp
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Creates a delay promise
 * @param ms Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export function createDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely clears a timeout
 * @param timeoutId The timeout ID to clear
 */
export function clearTimeoutSafely(timeoutId: ReturnType<typeof setTimeout> | null): void {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
}

/**
 * Escapes special characters in a string for use in a regular expression
 * @param string The string to escape
 * @returns The escaped string
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Type guard to check if a value is a plain object
 * @param value The value to check
 * @returns True if the value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard to check if a value is a primitive
 */
export function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

// Re-export validation utilities
export {
  validateOptions,
  validateMultiplayerOptions,
  validateAuthenticationOptions,
  validateNamespace,
  validateApiBaseUrl,
  validateZFactor,
  type ValidationResult,
  type ValidationOptions,
} from './config-validator';
