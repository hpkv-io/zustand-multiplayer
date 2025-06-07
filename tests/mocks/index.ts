// Export HPKVSubscriptionClient mock
export {
  MockHPKVSubscriptionClient,
  MockHPKVClientFactory,
  createMockToken,
} from './mock-hpkv-client';

// Export WebsocketTokenManager mock
export {
  MockTokenHelper,
  MockWebsocketTokenManager,
  createMockTokenManager,
} from './mock-token-manager';

// Re-export types from the real package that are used in mocks
export {
  ConnectionState,
  ConnectionStats,
  ConnectionConfig,
  HPKVResponse,
  HPKVEventHandler,
  HPKVNotificationResponse,
  RangeQueryOptions,
  HPKVTokenConfig,
} from '@hpkv/websocket-client';
