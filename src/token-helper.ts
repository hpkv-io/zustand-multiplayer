import { HPKVApiClient, HPKVClientFactory, WebsocketTokenManager } from '@hpkv/websocket-client';

/**
 * Request format for token generation endpoint
 */
export interface TokenRequest {
  /** Store name to generate token for */
  namespace: string;
  /** Keys to subscribe to */
  subscribedKeys: string[];
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
  private tokenManager: WebsocketTokenManager;
  private apiKey: string;
  private baseUrl: string;

  /**
   * Creates a new TokenHelper instance
   *
   * @param apiKey HPKV API key
   * @param baseUrl HPKV base URL
   */
  constructor(apiKey: string, baseUrl: string) {
    this.tokenManager = new WebsocketTokenManager(apiKey, baseUrl);
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Generates a WebSocket token for a store
   *
   * @param storeName The name of the store (used as key in HPKV)
   * @returns A WebSocket token
   */
  async generateTokenForStore(namespace: string, subscribedKeys: string[]): Promise<string> {
    let apiClient: HPKVApiClient | null = null;
    try {
      apiClient = HPKVClientFactory.createApiClient(this.apiKey, this.baseUrl);
      await apiClient.connect();
      // Check if the store exists, create it if not
      for (const key of subscribedKeys) {
        const result = await apiClient.get(key).catch(() => null);
        if (!result?.key || result.key !== key) {
          await apiClient.set(key, { value: '' });
        }
      }
      // Generate token with access limited to this store key
      const token = await this.tokenManager.generateToken({
        subscribeKeys: subscribedKeys,
        accessPattern: `^${escapeRegExp(namespace)}:.*$`,
      });

      return token;
    } catch (error) {
      throw new Error(`Failed to generate token for namespace ${namespace}: ${error}`);
    } finally {
      if (apiClient && apiClient.getConnectionStats().isConnected) {
        await apiClient.disconnect();
        apiClient.destroy();
      }
    }
  }

  /**
   * Process a token request and return a token response
   * Works with any framework by accepting a simple request object
   *
   * @param requestData The request data object or string
   * @returns TokenResponse object with the generated token
   */
  async processTokenRequest(requestData: unknown): Promise<TokenResponse> {
    try {
      // Parse the request data if it's a string
      let parsedRequest: Partial<TokenRequest>;

      if (typeof requestData === 'string') {
        try {
          parsedRequest = JSON.parse(requestData);
        } catch {
          throw new Error('Invalid request: Could not parse request data');
        }
      } else {
        parsedRequest = requestData as Partial<TokenRequest>;
      }

      // Validate the request
      const { namespace, subscribedKeys } = parsedRequest;

      if (!namespace || typeof namespace !== 'string') {
        throw new Error('Invalid request: namespace is required and must be a string');
      }

      // Generate the token
      const token = await this.generateTokenForStore(namespace, subscribedKeys || []);

      // Return the response
      return { namespace, token };
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error during token generation');
    }
  }

  /**
   * Create a request handler function for Express/Connect style frameworks
   *
   * @returns A function that can be used as an Express route handler
   */
  createExpressHandler() {
    return async (req: any, res: any) => {
      try {
        const response = await this.processTokenRequest(req.body);
        res.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ error: message });
      }
    };
  }

  /**
   * Create a handler for Next.js API routes
   */
  createNextApiHandler() {
    return async (req: any, res: any) => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const response = await this.processTokenRequest(req.body);
        res.status(200).json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ error: message });
      }
    };
  }

  /**
   * Create a handler for Fastify
   */
  createFastifyHandler() {
    return async (request: any, reply: any) => {
      try {
        const response = await this.processTokenRequest(request.body);
        return reply.send(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.code(400).send({ error: message });
      }
    };
  }
}

/**
 * Escapes special characters in a string for use in a regular expression
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
