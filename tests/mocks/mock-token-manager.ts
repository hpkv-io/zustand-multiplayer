import { HPKVTokenConfig } from '@hpkv/websocket-client';
import { createMockToken } from './mock-hpkv-client';

export class MockWebsocketTokenManager {
  constructor(
    private apiKey: string,
    private baseUrl: string,
  ) {}

  async generateToken(config: HPKVTokenConfig): Promise<string> {
    // Simulate async token generation
    await new Promise(resolve => setTimeout(resolve, 10));

    // Create a mock token with the provided configuration
    return createMockToken(config.subscribeKeys, config.accessPattern);
  }
}

// Helper factory to create mock token manager
export function createMockTokenManager(apiKey: string, baseUrl: string): MockWebsocketTokenManager {
  return new MockWebsocketTokenManager(apiKey, baseUrl);
}

export class MockTokenHelper {
  constructor(
    private apiKey: string,
    private baseUrl: string,
  ) {}

  async generateTokenForStore(namespace: string, subscribedKeys: string[]): Promise<string> {
    return createMockToken(subscribedKeys, `^${namespace}:.*$`);
  }
}
