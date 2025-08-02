// ============================================================================
// CONFIGURATION DEFAULTS
// ============================================================================

/**
 * Default Z-factor for nested state detection
 */
export const DEFAULT_Z_FACTOR = 2;

/**
 * Maximum allowed Z-factor value
 */
export const MAX_Z_FACTOR = 10;

/**
 * Minimum allowed Z-factor value
 */
export const MIN_Z_FACTOR = 0;

/**
 * Default network timeout in milliseconds
 */
export const DEFAULT_TIMEOUT = 5000;

/**
 * Default connection retry delay in milliseconds
 */
export const DEFAULT_RETRY_DELAY = 1000;

/**
 * Default backoff factor for network operations
 */
export const DEFAULT_BACKOFF_FACTOR = 2;

/**
 * Maximum retry attempts for network operations
 */
export const MAX_RETRY_ATTEMPTS = 3;

// ============================================================================
// TOKEN MANAGEMENT CONSTANTS
// ============================================================================

/**
 * Token expiry time in milliseconds (2 hours)
 */
export const TOKEN_EXPIRY_TIME = 2 * 60 * 60 * 1000;

/**
 * Token refresh buffer time in milliseconds (15 minutes before expiry)
 */
export const TOKEN_REFRESH_BUFFER = 15 * 60 * 1000;

// ============================================================================
// CACHE MANAGEMENT CONSTANTS
// ============================================================================

/**
 * Default cache maximum size
 */
export const DEFAULT_CACHE_MAX_SIZE = 1000;

/**
 * Default cache TTL in milliseconds (5 minutes)
 */
export const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Default cache cleanup interval in milliseconds (1 minute)
 */
export const DEFAULT_CACHE_CLEANUP_INTERVAL = 60 * 1000;

// ============================================================================
// STORAGE OPERATION CONSTANTS
// ============================================================================

/**
 * Default batch size for range queries
 */
export const DEFAULT_RANGE_BATCH_SIZE = 100;

// ============================================================================
// PERFORMANCE OPTIMIZATION CONSTANTS
// ============================================================================

/**
 * Maximum number of pending state changes to queue
 */
export const MAX_PENDING_CHANGES = 1000;

/**
 * Maximum number of operations to track for performance monitoring
 */
export const MAX_OPERATION_HISTORY = 500;

/**
 * Default debounce delay for state change batching (milliseconds)
 */
export const DEFAULT_STATE_CHANGE_DEBOUNCE = 50;
