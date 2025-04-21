/**
 * Type definitions for token generation API
 */

/**
 * Request format for token generation endpoint
 */
export interface TokenRequest {
  /** Store name to generate token for */
  storeName: string;
}

/**
 * Response format from token generation endpoint
 */
export interface TokenResponse {
  /** The store name the token is for */
  storeName: string;
  /** The generated WebSocket token */
  token: string;
}
