import { HPKVClientFactory, WebsocketTokenManager, HPKVApiClient } from '@hpkv/websocket-client';

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
}

/**
 * Escapes special characters in a string for use in a regular expression
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
