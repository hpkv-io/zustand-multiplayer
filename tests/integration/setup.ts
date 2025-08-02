import { vi } from 'vitest';
import { MockHPKVClientFactory } from '../mocks/mock-hpkv-client';
import { MockWebsocketTokenManager, MockTokenHelper } from '../mocks/mock-token-manager';

export { MockHPKVClientFactory, MockWebsocketTokenManager, MockTokenHelper };

export const ConnectionState = {
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  RECONNECTING: 'RECONNECTING',
};

export function setupE2EMocks() {
  vi.doMock('@hpkv/websocket-client', () => {
    return {
      HPKVClientFactory: MockHPKVClientFactory,
      WebsocketTokenManager: MockWebsocketTokenManager,
      ConnectionState: {
        CONNECTED: 'CONNECTED',
        DISCONNECTED: 'DISCONNECTED',
        CONNECTING: 'CONNECTING',
        RECONNECTING: 'RECONNECTING',
      },
    };
  });

  vi.doMock('../../src/auth/token-helper', () => {
    return {
      TokenHelper: MockTokenHelper,
    };
  });
}

export async function importAfterMocks() {
  const { StoreCreator } = await import('../utils/store-creator');
  return { StoreCreator };
}

export async function getMockedHPKVClientFactory() {
  const { HPKVClientFactory } = await import('@hpkv/websocket-client');
  return HPKVClientFactory;
}
