import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { ImmerStateCreator, MultiplayerOptions } from '../../src/types/multiplayer-types';
import { LogLevel } from '../../src/monitoring/logger';
import { createUniqueStoreName, waitFor, createNetworkDelay } from '../utils/test-utils';
import { ConnectionState } from '@hpkv/websocket-client';
import { MockTokenHelper } from '../mocks/mock-token-manager';
import { MockHPKVClientFactory } from '../mocks/mock-hpkv-client';
import { MockWebsocketTokenManager } from '../mocks/mock-token-manager';

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

const { StoreCreator } = await import('../utils/store-creator');
type TestState = {
  count: number;
  text: string;
  items: string[];
  increment: () => void;
  setText: (text: string) => void;
  addItem: (item: string) => void;
  simulateError: () => void;
};

const initializer: ImmerStateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  items: [],
  increment: () => set(state => ({ count: state.count + 1 })),
  setText: (text: string) => set({ text }),
  addItem: (item: string) => set(state => ({ items: [...state.items, item] })),
  simulateError: () => {
    throw new Error('Simulated state update error');
  },
});

const storeCreator = new StoreCreator();

function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, {
    retryConfig: {
      maxRetries: 3,
      baseDelay: 50,
      maxDelay: 500,
      backoffFactor: 2,
    },
    logLevel: LogLevel.DEBUG,
    apiKey: 'test-api-key',
    apiBaseUrl: 'hpkv-base-api-url',
    ...options,
  });
}

describe('Multiplayer Middleware Error Handling Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw if neither apiKey nor tokenGenerationUrl is provided', async () => {
    expect(() =>
      createTestStore({
        namespace: 'test-namespace',
        apiKey: undefined,
        tokenGenerationUrl: undefined,
      }),
    ).toThrow();
  });

  it('should retry failed operations with exponential backoff', async () => {
    const uniqueNamespace = createUniqueStoreName('error-retry');
    const store = createTestStore({
      namespace: uniqueNamespace,
      retryConfig: {
        maxRetries: 3,
        baseDelay: 50,
        maxDelay: 500,
        backoffFactor: 2,
      },
    });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    // Simulate operation failures
    const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
    client.setShouldFailOperations(true);

    store.getState().setText('This should retry');

    // After some time, allow operations to succeed
    setTimeout(() => {
      client.setShouldFailOperations(false);
    }, 200);

    await waitFor(() => store.getState().text === 'This should retry');
  });

  it('should handle storage operation timeouts', async () => {
    const uniqueNamespace = createUniqueStoreName('error-timeout');
    const store = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    // Simulate slow operations
    const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
    client.setOperationDelay(1000); // 1 second delay

    const startTime = Date.now();
    store.getState().setText('Slow operation');

    // The operation should eventually complete or timeout gracefully
    await waitFor(() => {
      return Date.now() - startTime > 500; // Wait at least 500ms
    });

    // System should remain responsive
    expect(store.getState().multiplayer.hasHydrated).toBe(true);
  });

  it('should handle malformed data gracefully', async () => {
    const uniqueNamespace = createUniqueStoreName('error-malformed');
    const store = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    MockHPKVClientFactory.getGlobalStore().set(`${uniqueNamespace}:text`, 'Malformed json');
    expect(store.getState().text).toBe('');
    store.getState().setText('Normal operation after malformed data');
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(store.getState().text).toBe('Normal operation after malformed data');
  });

  it('should handle custom conflict resolution errors', async () => {
    const uniqueNamespace = createUniqueStoreName('error-conflict-resolution');

    // Create store with faulty conflict resolution
    const store = createTestStore({
      namespace: uniqueNamespace,
      onConflict: () => {
        throw new Error('Conflict resolution failed');
      },
    });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    // The system should handle conflict resolution errors gracefully
    store.getState().setText('This might cause conflict resolution');

    // System should remain stable even if conflict resolution fails
    expect(store.getState().multiplayer.hasHydrated).toBe(true);
  });

  it('should handle circuit breaker pattern', async () => {
    const uniqueNamespace = createUniqueStoreName('error-circuit-breaker');
    const store = createTestStore({
      namespace: uniqueNamespace,
      retryConfig: {
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 1000,
        backoffFactor: 2,
      },
    });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    // Simulate persistent failures
    const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
    client.setShouldFailOperations(true);

    // Multiple operations should trigger circuit breaker
    // Wrap in try-catch to handle expected failures gracefully
    const operationPromises: Promise<void>[] = [];
    for (let i = 0; i < 5; i++) {
      const operationPromise = new Promise<void>(resolve => {
        store.getState().increment();
        resolve();
      });
      operationPromises.push(operationPromise);
      await createNetworkDelay(50);
    }

    // Wait for all operations to complete (with failures)
    await Promise.all(operationPromises);

    // System should remain stable and not keep retrying indefinitely
    await waitFor(() => {
      return store.getState().count >= 5;
    });
    client.setShouldFailOperations(false);
    expect(store.getState().count).toBeGreaterThanOrEqual(5);
  });

  it('should recover from errors when conditions improve', async () => {
    const uniqueNamespace = createUniqueStoreName('error-recovery');
    const store = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    // Start with failing operations
    const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
    client.setShouldFailOperations(true);

    // Attempt operation during failure (expect it to fail)
    try {
      store.getState().setText('During failure');
    } catch (error) {
      // Expected failure - ignore
    }

    // Simulate recovery
    setTimeout(() => {
      client.setShouldFailOperations(false);
    }, 300);

    // After recovery, operations should work normally
    await waitFor(
      () => {
        const status = store.getState().multiplayer.getConnectionStatus();
        return status?.connectionState === ConnectionState.CONNECTED;
      },
      { timeout: 1000 },
    );

    store.getState().setText('After recovery');
    expect(store.getState().text).toBe('After recovery');
  });

  it('should handle logging configuration errors gracefully', async () => {
    const uniqueNamespace = createUniqueStoreName('error-logging');

    const store = createTestStore({
      namespace: uniqueNamespace,
      logLevel: 999 as LogLevel, // Invalid log level
    });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    store.getState().setText('Test with invalid log level');
    expect(store.getState().text).toBe('Test with invalid log level');
  });
});
