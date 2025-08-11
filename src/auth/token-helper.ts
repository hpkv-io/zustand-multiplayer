import { WebsocketTokenManager } from '@hpkv/websocket-client';
import { escapeRegExp } from '../utils';

/**
 * Request format for token generation endpoint
 */
export interface TokenRequest {
  /** Store name to generate token for */
  namespace: string;
  /** Keys and patterns to subscribe to */
  subscribedKeysAndPatterns: string[];
}

/**
 * Response format from token generation endpoint
 */
export interface TokenResponse {
  /** The namespace the token is for */
  namespace: string;
  /** The generated WebSocket token */
  token: string;
}

/**
 * Utility to help generate WebSocket tokens for HPKV
 */
export class TokenHelper {
  private readonly tokenManager: WebsocketTokenManager;

  /**
   * Creates a new TokenHelper instance
   *
   * @param apiKey HPKV API key
   * @param baseUrl HPKV base URL
   */
  constructor(apiKey: string, baseUrl: string) {
    this.tokenManager = new WebsocketTokenManager(apiKey, baseUrl);
  }

  /**
   * Generate a token for a store with the given namespace and keys
   */
  async generateTokenForStore(
    namespace: string,
    subscribedKeysAnPatterns: string[],
  ): Promise<string> {
    const token = await this.tokenManager.generateToken({
      subscribePatterns: [...subscribedKeysAnPatterns],
      accessPattern: `^${escapeRegExp(namespace)}:.*$`,
    });

    return token;
  }

  /**
   * Process a token request and return a token response
   *
   * @param requestData The request data object or string
   * @returns TokenResponse object with the generated token
   */
  async processTokenRequest(requestData: unknown): Promise<TokenResponse> {
    try {
      let parsedRequest: Partial<TokenRequest>;

      if (typeof requestData === 'string') {
        try {
          parsedRequest = JSON.parse(requestData) as Partial<TokenRequest>;
        } catch {
          throw new Error('Invalid request: Could not parse request data');
        }
      } else {
        parsedRequest = requestData as Partial<TokenRequest>;
      }

      const { namespace, subscribedKeysAndPatterns } = parsedRequest;

      if (!namespace || typeof namespace !== 'string') {
        throw new Error('Invalid request: namespace is required and must be a string');
      }

      const token = await this.generateTokenForStore(namespace, subscribedKeysAndPatterns ?? []);

      return { namespace, token };
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error during token generation');
    }
  }
}
