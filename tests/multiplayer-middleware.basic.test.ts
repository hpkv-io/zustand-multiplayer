import { describe, it, expect, vi, afterAll } from 'vitest';
import {
  ImmerStateCreator,
  MultiplayerOptions,
  WithMultiplayer,
} from '../src/types/multiplayer-types';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createUniqueStoreName, waitFor } from './utils/test-utils';
import {
  ConnectionState,
  MockHPKVClientFactory,
  MockTokenHelper,
  MockWebsocketTokenManager,
} from './mocks';
import { HPKVGetResponse } from '@hpkv/websocket-client';

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

vi.doMock('../src/auth/token-helper', () => {
  return {
    TokenHelper: MockTokenHelper,
  };
});
const multiplayerModule = await import('../src/multiplayer');
const { StoreCreator } = await import('./utils/store-creator');
const { multiplayer } = multiplayerModule;

type TestState = {
  count: number;
  text: string;
  nested: {
    value: number;
  };
  increment: () => void;
  decrement: () => void;
  setText: (text: string) => void;
  updateNested: (value: number) => void;
};

const initializer: ImmerStateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0 },
  increment: () => set(state => ({ count: state.count + 1 })),
  decrement: () => set(state => ({ count: state.count - 1 })),
  setText: (text: string) =>
    set(state => {
      state.text = text;
    }),
  updateNested: (value: number) =>
    set(state => {
      state.nested.value = value;
    }),
});

const storeCreator = new StoreCreator();
function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, {
    apiKey: 'test-api-key',
    apiBaseUrl: 'hpkv-base-api-url',
    profiling: true,
    ...options,
  });
}

describe('Multiplayer Middleware Basic Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  describe('Store Creation & Initialization', () => {
    it('should create a zustand store with initial state', () => {
      const store = createTestStore();
      expect(store.getState().count).toBe(0);
      expect(store.getState().text).toBe('');
      expect(store.getState().nested.value).toBe(0);
    });

    it('should have multiplayer state with all required properties', () => {
      const store = createTestStore();
      const multiplayer = store.getState().multiplayer;

      expect(multiplayer).toBeDefined();
      expect(typeof multiplayer.connectionState).toBe('string');
      expect(typeof multiplayer.hasHydrated).toBe('boolean');
      expect(typeof multiplayer.disconnect).toBe('function');
      expect(typeof multiplayer.clearStorage).toBe('function');
      expect(typeof multiplayer.getMetrics).toBe('function');
      expect(typeof multiplayer.getConnectionStatus).toBe('function');
      expect(typeof multiplayer.connect).toBe('function');
      expect(typeof multiplayer.hydrate).toBe('function');
      expect(typeof multiplayer.destroy).toBe('function');
    });

    it('should throw error when neither apiKey nor tokenGenerationUrl is provided', () => {
      expect(() => {
        create()(
          multiplayer(initializer, {
            namespace: 'test',
            apiBaseUrl: 'https://api.example.com',
          }),
        );
      }).toThrow('Either apiKey or tokenGenerationUrl must be provided');
    });

    it('should create a store with tokenGenerationUrl', async () => {
      const store = storeCreator.createStore<TestState>(initializer, {
        namespace: createUniqueStoreName('token-url-test'),
        apiBaseUrl: 'https://api.example.com',
        tokenGenerationUrl: 'https://api.example.com/generate-token',
      });
      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState === ConnectionState.CONNECTED).toBe(
          true,
        );
      });
    });

    it('should create a store with apiKey', async () => {
      const store = storeCreator.createStore<TestState>(initializer, {
        namespace: createUniqueStoreName('api-key-test'),
        apiBaseUrl: 'https://api.example.com',
        apiKey: 'test-api-key',
      });
      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState === ConnectionState.CONNECTED).toBe(
          true,
        );
      });
    });

    it('should have performance metrics available', () => {
      const store = createTestStore();
      const metrics = store.getState().multiplayer.getMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics.stateChangesProcessed).toBe('number');
      expect(typeof metrics.averageSyncTime).toBe('number');
      expect(typeof metrics.averageHydrationTime).toBe('number');
    });

    it('should have connection status available', () => {
      const store = createTestStore();
      const status = store.getState().multiplayer.getConnectionStatus();

      expect(status).toBeDefined();
      if (status) {
        expect(typeof status.isConnected).toBe('boolean');
        expect(typeof status.connectionState).toBe('string');
        expect(typeof status.reconnectAttempts).toBe('number');
        expect(typeof status.messagesPending).toBe('number');
      }
    });
  });

  describe('Connection Management', () => {
    it('should connect automatically after creation', async () => {
      const store = createTestStore();
      await waitFor(
        () => store.getState().multiplayer.connectionState === ConnectionState.CONNECTED,
      );
      expect(store.getState().multiplayer.connectionState).toBe('CONNECTED');
    });

    it('should track connection state changes', async () => {
      const store = createTestStore();
      await waitFor(() => expect(store.getState().multiplayer.connectionState).toBe('CONNECTED'));

      await store.getState().multiplayer.disconnect();
      expect(store.getState().multiplayer.connectionState).toBe('DISCONNECTED');

      await store.getState().multiplayer.connect();
      expect(store.getState().multiplayer.connectionState).toBe('CONNECTED');
    });

    it('should automatically reconnect when connection is lost', async () => {
      const uniqueNamespace = createUniqueStoreName('auto-reconnect-test');
      const store = createTestStore({
        namespace: uniqueNamespace,
        clientConfig: {
          maxReconnectAttempts: 3,
        },
      });
      await waitFor(() => expect(store.getState().multiplayer.connectionState).toBe('CONNECTED'));

      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      const stateChanges: string[] = [];
      const unsubscribe = store.subscribe(state => {
        stateChanges.push(state.multiplayer.connectionState);
      });

      try {
        client.simulateDisconnect();
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(
          stateChanges.some(state => state === 'DISCONNECTED' || state === 'RECONNECTING'),
        ).toBe(true);
        expect(store.getState().multiplayer.connectionState).toBe('CONNECTED');
      } finally {
        unsubscribe();
      }
    });

    it('should reconnect when store is updated in disconnected state', async () => {
      const uniqueNamespace = createUniqueStoreName('reconnect-on-update-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await store.getState().multiplayer.disconnect();
      expect(store.getState().multiplayer.connectionState).toBe('DISCONNECTED');

      store.getState().increment();

      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      });
    });

    it('should handle multiple connect/disconnect cycles', async () => {
      const store = createTestStore();

      for (let i = 0; i < 3; i++) {
        await waitFor(() => expect(store.getState().multiplayer.connectionState).toBe('CONNECTED'));
        await store.getState().multiplayer.disconnect();
        expect(store.getState().multiplayer.connectionState).toBe('DISCONNECTED');
        await store.getState().multiplayer.connect();
      }

      expect(store.getState().multiplayer.connectionState).toBe('CONNECTED');
    });
  });

  describe('State Persistence & Hydration', () => {
    it('should persist state changes', async () => {
      const uniqueNamespace = createUniqueStoreName('persistence-test');
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);
      store.getState().increment();
      store.getState().setText('Persisted Text');
      store.getState().updateNested(10);
      await new Promise(resolve => setTimeout(resolve, 100));
      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      const countKey = (await client.get(`${uniqueNamespace}:count`)) as HPKVGetResponse;
      const textKey = (await client.get(`${uniqueNamespace}:text`)) as HPKVGetResponse;
      const nestedKey = (await client.get(`${uniqueNamespace}:nested:value`)) as HPKVGetResponse;
      expect(JSON.parse(countKey.value as string).value).toBe(1);
      expect(JSON.parse(textKey.value as string).value).toBe('Persisted Text');
      expect(JSON.parse(nestedKey.value as string).value).toBe(10);
    });

    it('should hydrate the store after creation', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });

      store1.getState().increment();
      store1.getState().setText('Persisted Text');
      await new Promise(resolve => setTimeout(resolve, 100));

      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Persisted Text');
    });

    it('should not persist state functions', async () => {
      const uniqueNamespace = createUniqueStoreName('function-persistence-test');
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);
      store.getState().updateNested(10);
      await new Promise(resolve => setTimeout(resolve, 100));
      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      await expect(client.get(`${uniqueNamespace}:updateNested`)).resolves.toHaveProperty(
        'code',
        404,
      );
      await expect(client.get(`${uniqueNamespace}:increment`)).resolves.toHaveProperty('code', 404);
      await expect(client.get(`${uniqueNamespace}:decrement`)).resolves.toHaveProperty('code', 404);
      await expect(client.get(`${uniqueNamespace}:setText`)).resolves.toHaveProperty('code', 404);
    });

    it('should hydrate nested states correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('nested-persistence-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });

      store1.getState().updateNested(42);
      await new Promise(resolve => setTimeout(resolve, 100));

      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);
      expect(store2.getState().nested.value).toBe(42);
    });

    it('should call onHydrate callback when provided', async () => {
      const onHydrate = vi.fn();
      const store = createTestStore({
        namespace: createUniqueStoreName('on-hydrate-test'),
        onHydrate,
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);
      expect(onHydrate).toHaveBeenCalled();
    });
  });

  describe('Data Synchronization', () => {
    it('should synchronize primitive state changes between clients', async () => {
      const uniqueNamespace = createUniqueStoreName('sync-primitives-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      store1.getState().increment();
      store2.getState().setText('Synced Text');

      await waitFor(() => {
        expect(store1.getState().text).toBe('Synced Text');
        expect(store2.getState().count).toBe(1);
      });
    });

    it('should synchronize nested object changes', async () => {
      const uniqueNamespace = createUniqueStoreName('sync-nested-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      store1.getState().updateNested(100);

      await waitFor(() => expect(store2.getState().nested.value).toBe(100));
    });

    it('should handle rapid state updates', async () => {
      const uniqueNamespace = createUniqueStoreName('rapid-updates-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store1.getState().multiplayer.hasHydrated);
      await waitFor(() => store2.getState().multiplayer.hasHydrated);
      // Perform rapid updates
      for (let i = 0; i < 10; i++) {
        store1.getState().increment();
      }

      await waitFor(() => {
        expect(store2.getState().count).toBe(10);
      });
    });

    it('should not sync function properties', async () => {
      const uniqueNamespace = createUniqueStoreName('no-function-sync-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);
      store.getState().increment();
      store.getState().setText('Synced Text');
      await new Promise(resolve => setTimeout(resolve, 100));

      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];

      // Functions should not be stored
      await expect(client.get(`${uniqueNamespace}:count`)).resolves.toHaveProperty('code', 200);
      await expect(client.get(`${uniqueNamespace}:increment`)).resolves.toHaveProperty('code', 404);
      await expect(client.get(`${uniqueNamespace}:decrement`)).resolves.toHaveProperty('code', 404);
      await expect(client.get(`${uniqueNamespace}:setText`)).resolves.toHaveProperty('code', 404);
    });
  });

  describe('Storage Operations', () => {
    it('should create keys with correct namespace formatting', async () => {
      const uniqueNamespace = createUniqueStoreName('storage-keys-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      store.getState().increment();
      store.getState().setText('Test Text');
      store.getState().updateNested(25);
      await new Promise(resolve => setTimeout(resolve, 100));

      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      await expect(client.get(`${uniqueNamespace}:count`)).resolves.toHaveProperty('code', 200);
      await expect(client.get(`${uniqueNamespace}:text`)).resolves.toHaveProperty('code', 200);
      await expect(client.get(`${uniqueNamespace}:nested:value`)).resolves.toHaveProperty(
        'code',
        200,
      );
    });

    it('should clear all data when calling clearStorage', async () => {
      const uniqueNamespace = createUniqueStoreName('clear-storage-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });

      store1.getState().increment();
      store1.getState().setText('To Be Cleared');
      await new Promise(resolve => setTimeout(resolve, 100));

      await store1.getState().multiplayer.clearStorage();

      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => {
        expect(store2.getState().count).toBe(0);
        expect(store2.getState().text).toBe('');
      });
    });

    it('should remove keys from storage when cleared', async () => {
      const uniqueNamespace = createUniqueStoreName('clear-keys-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      store.getState().increment();
      store.getState().setText('To Be Removed');
      store.getState().updateNested(50);
      await new Promise(resolve => setTimeout(resolve, 100));

      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      await store.getState().multiplayer.clearStorage();

      await expect(client.get(`${uniqueNamespace}:count`)).resolves.toHaveProperty('code', 404);
      await expect(client.get(`${uniqueNamespace}:text`)).resolves.toHaveProperty('code', 404);
      await expect(client.get(`${uniqueNamespace}:nested:value`)).resolves.toHaveProperty(
        'code',
        404,
      );
    });
  });

  describe('Namespace Isolation', () => {
    it('should isolate state between different namespaces', async () => {
      const namespace1 = createUniqueStoreName('isolation-test-1');
      const namespace2 = createUniqueStoreName('isolation-test-2');
      const store1 = createTestStore({ namespace: namespace1 });
      const store2 = createTestStore({ namespace: namespace2 });

      store1.getState().increment();
      store1.getState().setText('Store 1');
      store2.getState().setText('Store 2');

      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        expect(store1.getState().count).toBe(1);
        expect(store1.getState().text).toBe('Store 1');
        expect(store2.getState().count).toBe(0);
        expect(store2.getState().text).toBe('Store 2');
      });
    });

    it('should not receive updates from different namespaces', async () => {
      const namespace1 = createUniqueStoreName('no-cross-updates-1');
      const namespace2 = createUniqueStoreName('no-cross-updates-2');
      const store1 = createTestStore({ namespace: namespace1 });
      const store2 = createTestStore({ namespace: namespace2 });

      await waitFor(() => store1.getState().multiplayer.hasHydrated);
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      const subscriber = vi.fn();
      store2.subscribe(subscriber);

      store1.getState().increment();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Store2 should not have received any updates from store1
      expect(subscriber).not.toHaveBeenCalled();
    });
  });

  describe('Middleware Integration', () => {
    it('should work with another middleware', async () => {
      const uniqueNamespace = createUniqueStoreName('middleware-test');
      const store = create<WithMultiplayer<TestState>>()(
        subscribeWithSelector(
          multiplayer(initializer, {
            namespace: uniqueNamespace,
            apiBaseUrl: 'hpkv-base-api-url',
            apiKey: 'test-api-key',
          }),
        ),
      );

      const subscriber = vi.fn();
      store.subscribe(state => state.count, subscriber);

      store.getState().increment(); // This should trigger subscriber
      store.getState().setText('No Trigger'); // This should NOT trigger subscriber

      await new Promise(resolve => setTimeout(resolve, 100));
      await waitFor(() => {
        expect(subscriber).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Immer-Style Updates', () => {
    it('should support immer-style draft updates', async () => {
      const uniqueNamespace = createUniqueStoreName('immer-updates-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      store.setState(state => {
        state.count = 5;
        state.text = 'Immer Update';
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(store.getState().count).toBe(5);
      expect(store.getState().text).toBe('Immer Update');
    });

    it('should sync immer-style updates between clients', async () => {
      const uniqueNamespace = createUniqueStoreName('immer-sync-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      store1.setState(draft => {
        draft.count = 10;
        draft.text = 'Synced Immer';
      });

      await waitFor(() => {
        expect(store2.getState().count).toBe(10);
        expect(store2.getState().text).toBe('Synced Immer');
      });
    });
  });

  describe('Metrics & Monitoring', () => {
    it('should update metrics when operations are performed', async () => {
      const uniqueNamespace = createUniqueStoreName('metrics-update-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      const initialMetrics = store.getState().multiplayer.getMetrics();

      store.getState().increment();
      store.getState().setText('Metrics Test');

      await waitFor(() => {
        const newMetrics = store.getState().multiplayer.getMetrics();
        return newMetrics.stateChangesProcessed > initialMetrics.stateChangesProcessed;
      });

      const finalMetrics = store.getState().multiplayer.getMetrics();
      expect(finalMetrics.stateChangesProcessed).toBeGreaterThan(
        initialMetrics.stateChangesProcessed,
      );
    });

    it('should track hydration time in metrics', async () => {
      const store = createTestStore({ namespace: createUniqueStoreName('hydration-metrics-test') });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      const metrics = store.getState().multiplayer.getMetrics();
      expect(metrics.averageHydrationTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle empty initial state', () => {
      const emptyInitializer: ImmerStateCreator<
        {},
        [['zustand/multiplayer', unknown]],
        []
      > = () => ({});
      const store = storeCreator.createStore<{}>(emptyInitializer, {
        namespace: createUniqueStoreName('empty-state-test'),
        apiKey: 'test-api-key',
        apiBaseUrl: 'hpkv-base-api-url',
      });

      expect(store.getState()).toBeDefined();
      expect(store.getState().multiplayer).toBeDefined();
    });

    it('should handle undefined and null values correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('null-undefined-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      store.setState({ text: null as any });
      await new Promise(resolve => setTimeout(resolve, 100));

      // Null values should be handled gracefully
      expect(store.getState().text).toBeNull();
    });
  });
});
