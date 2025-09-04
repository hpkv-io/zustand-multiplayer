// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/** Default Z-factor for nested state detection */
export const DEFAULT_Z_FACTOR = 2;
/** Maximum allowed Z-factor value */
export const MAX_Z_FACTOR = 10;
/** Minimum allowed Z-factor value */
export const MIN_Z_FACTOR = 0;

// ============================================================================
// NETWORK & RETRY
// ============================================================================

/** Default network timeout in milliseconds */
export const DEFAULT_TIMEOUT = 5000;
/** Default connection retry delay in milliseconds */
export const DEFAULT_RETRY_DELAY = 1000;
/** Default backoff factor for network operations */
export const DEFAULT_BACKOFF_FACTOR = 2;
/** Maximum retry attempts for network operations */
export const MAX_RETRY_ATTEMPTS = 3;

// ============================================================================
// AUTHENTICATION
// ============================================================================

/** Token expiry time in milliseconds (2 hours) */
export const TOKEN_EXPIRY_TIME = 2 * 60 * 60 * 1000;
/** Token refresh buffer time in milliseconds (15 minutes before expiry) */
export const TOKEN_REFRESH_BUFFER = 15 * 60 * 1000;

// ============================================================================
// PERFORMANCE
// ============================================================================

/** Maximum number of operations to track for performance monitoring */
export const MAX_OPERATION_HISTORY = 5;
