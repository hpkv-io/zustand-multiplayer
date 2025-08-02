import type { HPKVTokenConfig } from '@hpkv/websocket-client';
import { createMockToken } from './mock-hpkv-client';

export class MockWebsocketTokenManager {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async generateToken(config: HPKVTokenConfig): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 10));

    return createMockToken(config.subscribePatterns ?? [], config.accessPattern);
  }
}

export function createMockTokenManager(apiKey: string, baseUrl: string): MockWebsocketTokenManager {
  return new MockWebsocketTokenManager(apiKey, baseUrl);
}

export class MockTokenHelper {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async generateTokenForStore(namespace: string, subscribedKeys: string[]): Promise<string> {
    const allSubscribedKeys = [...subscribedKeys, ...subscribedKeys.map(key => `${key}:*`)];
    return await Promise.resolve(createMockToken(allSubscribedKeys, `^${namespace}:.*$`));
  }
}
