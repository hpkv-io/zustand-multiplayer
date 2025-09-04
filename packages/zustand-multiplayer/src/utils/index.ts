/**
 * Generates a cryptographically secure unique client identifier
 * @returns A unique client identifier string
 */
export function generateClientId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const randomString = Array.from(array, byte => byte.toString(36))
      .join('')
      .substring(0, 15);
    return `client_${Date.now()}_${randomString}`;
  }

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
