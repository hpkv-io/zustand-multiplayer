import { HPKVClientFactory, WebsocketTokenManager, HPKVApiClient } from '@hpkv/websocket-client';
import { TokenRequest, TokenResponse } from './types/token-api';

/**
 * Utility to help generate WebSocket tokens for HPKV
 */
export class TokenHelper {
  private apiClient: HPKVApiClient;
  private tokenManager: WebsocketTokenManager;

  /**
   * Creates a new TokenHelper instance
   *
   * @param apiKey HPKV API key
   * @param baseUrl HPKV base URL
   */
  constructor(apiKey: string, baseUrl: string) {
    this.apiClient = HPKVClientFactory.createApiClient(apiKey, baseUrl);
    this.tokenManager = new WebsocketTokenManager(apiKey, baseUrl);
  }

  /**
   * Generates a WebSocket token for a store
   *
   * @param storeName The name of the store (used as key in HPKV)
   * @returns A WebSocket token
   */
  async generateTokenForStore(storeName: string): Promise<string> {
    try {
      await this.apiClient.connect();
      // Check if the store exists, create it if not
      const result = await this.apiClient.get(storeName).catch(() => null);
      if (!result?.key || result.key !== storeName) {
        await this.apiClient.set(storeName, {});
      }

      // Generate token with access limited to this store key
      const token = await this.tokenManager.generateToken({
        subscribeKeys: [storeName],
        accessPattern: `^${escapeRegExp(storeName)}$`,
      });

      return token;
    } catch (error) {
      throw new Error(`Failed to generate token for store ${storeName}: ${error}`);
    } finally {
      if (this.apiClient && this.apiClient.getConnectionStats().isConnected) {
        await this.apiClient.disconnect();
        this.apiClient.destroy();
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
      const { storeName } = parsedRequest;

      if (!storeName || typeof storeName !== 'string') {
        throw new Error('Invalid request: storeName is required and must be a string');
      }

      // Generate the token
      const token = await this.generateTokenForStore(storeName);

      // Return the response
      return { storeName, token };
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
