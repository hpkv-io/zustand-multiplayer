import { describe, it, expect, vi, afterAll } from 'vitest';
import { MultiplayerOptions, WithMultiplayer } from '../src/multiplayer';
import { create, StateCreator } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createUniqueStoreName, waitFor } from './utils/test-utils';
import {
  ConnectionState,
  MockHPKVClientFactory,
  MockTokenHelper,
  MockWebsocketTokenManager,
} from './mocks';

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

vi.doMock('../src/token-helper', () => {
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

const initializer: StateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0 },
  increment: () => set(state => ({ count: state.count + 1 })),
  decrement: () => set(state => ({ count: state.count - 1 })),
  setText: (text: string) => set({ text }),
  updateNested: (value: number) => set({ nested: { value } }),
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

  it('should create a zustand store', () => {
    const store1 = createTestStore();
    expect(store1.getState().count).toBe(0);
    expect(store1.getState().text).toBe('');
    expect(store1.getState().nested.value).toBe(0);
  });

  it('should have multiplayer state', () => {
    const store1 = createTestStore();
    expect(store1.getState().multiplayer).toBeDefined();
    expect(typeof store1.getState().multiplayer.connectionState).toBe('string');
    expect(typeof store1.getState().multiplayer.hasHydrated).toBe('boolean');
    expect(typeof store1.getState().multiplayer.disconnect).toBe('function');
    expect(typeof store1.getState().multiplayer.clearStorage).toBe('function');
    expect(typeof store1.getState().multiplayer.getMetrics).toBe('function');
    expect(typeof store1.getState().multiplayer.getConnectionStatus).toBe('function');
    expect(typeof store1.getState().multiplayer.connect).toBe('function');
    expect(typeof store1.getState().multiplayer.hydrate).toBe('function');
  });

  it('should have performance metrics', () => {
    const store = createTestStore();
    const metrics = store.getState().multiplayer.getMetrics();

    expect(metrics).toBeDefined();
    expect(typeof metrics.stateChangesProcessed).toBe('number');
    expect(typeof metrics.averageHydrationTime).toBe('number');
  });

  it('should have connection status', () => {
    const store = createTestStore();
    const status = store.getState().multiplayer.getConnectionStatus();

    if (status) {
      expect(typeof status.isConnected).toBe('boolean');
      expect(typeof status.connectionState).toBe('string');
      expect(typeof status.reconnectAttempts).toBe('number');
      expect(typeof status.messagesPending).toBe('number');
    }
  });

  it('should hydrate the store after creation', async () => {
    const store = createTestStore();

    await waitFor(() => store.getState().multiplayer.hasHydrated);
    expect(store.getState().multiplayer.hasHydrated).toBe(true);
  });

  it('should connect automatically after creation', async () => {
    const store = createTestStore();
    await waitFor(() => store.getState().multiplayer.connectionState === ConnectionState.CONNECTED);
    expect(store.getState().multiplayer.connectionState).toBe('CONNECTED');
  });

  it('should track connection state', async () => {
    const store = createTestStore();
    await waitFor(() => expect(store.getState().multiplayer.connectionState).toBe('CONNECTED'));

    await store.getState().multiplayer.disconnect();
    expect(store.getState().multiplayer.connectionState).toBe('DISCONNECTED');

    await store.getState().multiplayer.connect();
    expect(store.getState().multiplayer.connectionState).toBe('CONNECTED');
  });

  it('should try to reconnect when connection is lost', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace-reconnect-test');
    const store = createTestStore({
      namespace: uniqueNamespace,
      clientConfig: {
        maxReconnectAttempts: 3,
      },
    });
    await waitFor(() => expect(store.getState().multiplayer.connectionState).toBe('CONNECTED'));

    // Get the mocked client and simulate disconnect
    const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];

    // Track state changes
    const stateChanges: string[] = [];
    const unsubscribe = store.subscribe(state => {
      stateChanges.push(state.multiplayer.connectionState);
    });

    try {
      // Simulate a disconnect
      client.simulateDisconnect();

      // Wait a bit for the disconnect and reconnection process to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify that the reconnection sequence happened
      // We should see DISCONNECTED (or RECONNECTING) and then CONNECTED
      expect(stateChanges.some(state => state === 'DISCONNECTED' || state === 'RECONNECTING')).toBe(
        true,
      );
      expect(store.getState().multiplayer.connectionState).toBe('CONNECTED');
    } finally {
      unsubscribe();
    }
  });

  it('should synchronize primitive state changes between clients in the same namespace', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });

    store1.getState().increment();
    store2.getState().setText('Hello HPKV');
    await waitFor(() => {
      expect(store1.getState().text).toBe('Hello HPKV');
      expect(store2.getState().count).toBe(1);
    });
  });

  it('should synchronize nested object changes', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });
    store1.getState().updateNested(42);
    await waitFor(() => expect(store2.getState().nested.value).toBe(42));
  });

  it('should isolate state between namespaces', async () => {
    const uniqueNamespace1 = createUniqueStoreName('namespace-1');
    const uniqueNamespace2 = createUniqueStoreName('namespace-2');
    const store1 = createTestStore({ namespace: uniqueNamespace1 });
    const store2 = createTestStore({ namespace: uniqueNamespace2 });

    store1.getState().increment();
    store2.getState().setText('Hello');
    await new Promise(resolve => setTimeout(resolve, 100));
    await waitFor(() => {
      expect(store1.getState().count).toBe(1);
      expect(store2.getState().count).toBe(0);
      expect(store1.getState().text).toBe('');
      expect(store2.getState().text).toBe('Hello');
    });
  });

  it('should persist the state', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });

    store1.getState().increment();
    store1.getState().setText('Hello HPKV');
    await new Promise(resolve => setTimeout(resolve, 100));

    const newStore = createTestStore({ namespace: uniqueNamespace });
    await waitFor(() => {
      expect(newStore.getState().count).toBe(1);
      expect(newStore.getState().text).toBe('Hello HPKV');
    });
  });

  it('should try to reconnect when store is updated in disconnected state', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store = createTestStore({ namespace: uniqueNamespace });
    await store.getState().multiplayer.disconnect();
    store.getState().increment();
    await waitFor(() => {
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
    });
  });

  it('should clear all data when calling clearStorage', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });

    store1.getState().increment();
    store1.getState().setText('Test');
    await new Promise(resolve => setTimeout(resolve, 100));

    await store1.getState().multiplayer.clearStorage();

    const store3 = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store3.getState().count).toBe(0);
      expect(store3.getState().text).toBe('');
    });
  });

  it('should combine with other middlewares', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
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
    // subscriber should receive this change
    store.getState().increment();
    // subscriber should not receive this change
    store.getState().setText('Hello');
    await new Promise(resolve => setTimeout(resolve, 100));
    await waitFor(() => {
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
  });

  it('should update metrics when operations are performed', async () => {
    const uniqueNamespace = createUniqueStoreName('metrics-test');
    const store = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    const initialMetrics = store.getState().multiplayer.getMetrics();

    store.getState().increment();
    store.getState().setText('metrics test');

    await waitFor(() => {
      const newMetrics = store.getState().multiplayer.getMetrics();
      return newMetrics.stateChangesProcessed > initialMetrics.stateChangesProcessed;
    });

    const finalMetrics = store.getState().multiplayer.getMetrics();
    expect(finalMetrics.stateChangesProcessed).toBeGreaterThan(
      initialMetrics.stateChangesProcessed,
    );
  });
});
