// ============================================================================
// SHARED CONSTANTS
// ============================================================================

/**
 * Field name for multiplayer state in Zustand stores
 */
export const MULTIPLAYER_FIELD = 'multiplayer';

/**
 * String indicator for arrow functions in function toString()
 */
export const ARROW_FUNCTION_INDICATOR = '=>';

/**
 * Path separator for key construction
 */
export const PATH_SEPARATOR = ':';

/**
 * Alternative path separator for display purposes
 */
export const DISPLAY_PATH_SEPARATOR = '.';

/**
 * Maximum depth for recursive operations to prevent infinite recursion
 */
export const MAX_DEPTH = 10;

/**
 * Object prototype string for plain object detection
 */
export const OBJECT_PROTOTYPE = '[object Object]';

/**
 * Minimum number of failures before circuit breaker activation
 */
export const MINIMUM_CIRCUIT_BREAKER_FAILURES = 3;

/**
 * Default token expiry time in milliseconds (2 hours)
 */
export const DEFAULT_TOKEN_EXPIRY_MS = 2 * 60 * 60 * 1000;

/**
 * Default token refresh time before expiry in milliseconds (15 minutes)
 */
export const DEFAULT_TOKEN_REFRESH_BEFORE_EXPIRY_MS = 15 * 60 * 1000;

// ============================================================================
// OPERATION NAMES
// ============================================================================

/**
 * Common operation names for logging and error context
 */
export const OPERATIONS = {
  HYDRATION: 'hydration',
  CONNECTION: 'connection',
  CLEANUP: 'cleanup',
  STATE_CHANGE: 'state-change',
  SYNC_PATH: 'sync-path',
  DELETE_PATH: 'delete-path',
  SETUP_CLIENT: 'setupClient',
  FETCH_TOKEN: 'fetchToken',
  ENSURE_CONNECTION: 'ensureConnection',
  GET_ALL_ITEMS: 'getAllItems',
  SET_ITEM: 'setItem',
  REMOVE_ITEM: 'removeItem',
  AUTHENTICATION_VALIDATION: 'authentication-validation',
  STORE_INITIALIZATION: 'store-initialization',
  REMOTE_CHANGE: 'remote-change',
  AUTO_HYDRATION: 'auto-hydration'
} as const;

// ============================================================================
// HTTP CONSTANTS
// ============================================================================

/**
 * HTTP methods
 */
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH'
} as const;

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_SERVER_ERROR: 500
} as const;

// ============================================================================
// EVENT NAMES
// ============================================================================

/**
 * Browser and DOM event names
 */
export const DOM_EVENTS = {
  BEFORE_UNLOAD: 'beforeunload',
  ONLINE: 'online',
  OFFLINE: 'offline'
} as const;

/**
 * HPKV client event names
 */
export const HPKV_EVENTS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  RECONNECT_FAILED: 'reconnectFailed',
  ERROR: 'error'
} as const;

// ============================================================================
// TYPE NAMES
// ============================================================================

/**
 * JavaScript type names for typeof checks
 */
export const JS_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  FUNCTION: 'function',
  UNDEFINED: 'undefined'
} as const; 