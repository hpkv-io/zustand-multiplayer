import { ConnectionState, HPKVApiClient, HPKVClientFactory } from '@hpkv/websocket-client';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { StateCreator, StoreApi, UseBoundStore } from 'zustand';
import type {
  MultiplayerOptions,
  WithMultiplayer,
  WithMultiplayerMiddleware,
} from '../../src/types/multiplayer-types';
import { StoreCreator } from '../utils/store-creator';
import { createUniqueStoreName, waitFor, createTestServer } from '../utils/test-utils';

interface TestState {
  count: number;
  text: string;
  nested: {
    value: number;
  };
  todos: Record<string, { id: string; text: string; completed: boolean }>;
  increment: () => void;
  decrement: () => void;
  setText: (text: string) => void;
  updateNested: (value: number) => void;
  addTodo: (todo: { id: string; text: string; completed: boolean }) => void;
}

type TestZustandStore = UseBoundStore<
  WithMultiplayerMiddleware<StoreApi<WithMultiplayer<TestState>>, WithMultiplayer<TestState>>
>;

const initializer: StateCreator<TestState, [], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0 },
  todos: {},
  increment: () =>
    set(state => ({
      count: state.count + 1,
    })),
  decrement: () =>
    set(state => ({
      count: state.count - 1,
    })),
  setText: (text: string) => set({ text }),
  updateNested: (value: number) => set({ nested: { value } }),
  addTodo: (todo: { id: string; text: string; completed: boolean }) =>
    set(state => ({
      todos: {
        ...state.todos,
        [todo.id]: todo,
      },
    })),
});

describe('Multiplayer Middleware Basic Integration Tests', () => {
  const skip = !process.env.HPKV_API_KEY || !process.env.HPKV_API_BASE_URL;
  let helperClient: HPKVApiClient;
  const storeCreator = new StoreCreator();

  beforeAll(async () => {
    helperClient = HPKVClientFactory.createApiClient(
      process.env.HPKV_API_KEY ?? '',
      process.env.HPKV_API_BASE_URL ?? '',
    );
    await helperClient.connect();
  });

  afterAll(async () => {
    await storeCreator.cleanupAllStores();
    await helperClient.disconnect();
    helperClient.destroy();
  });

  function createTestStore(
    options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
  ): TestZustandStore {
    return storeCreator.createStore<TestState>(initializer, {
      apiKey: process.env.HPKV_API_KEY,
      apiBaseUrl: process.env.HPKV_API_BASE_URL,
      ...options,
    });
  }

  it.skipIf(skip)('should automatically connect when store is created', async () => {
    const uniqueNamespace = createUniqueStoreName('integration-auto-connect-test');
    const store = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
    });
  });

  it.skipIf(skip)('should automatically hydrate when store is created', async () => {
    const uniqueNamespace = createUniqueStoreName('integration-auto-hydrate-test');
    const store = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });
  });

  it.skipIf(skip)('should disconnect when disconnect is called', async () => {
    const uniqueNamespace = createUniqueStoreName('integration-disconnect-test');
    const store = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.DISCONNECTED);
    });

    await store.getState().multiplayer.disconnect();

    await waitFor(() => {
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.DISCONNECTED);
    });
  });

  it.skipIf(skip)(
    'should synchronize state changes between clients in the same namespace',
    async () => {
      const uniqueNamespace = createUniqueStoreName('sync-integration-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({
        namespace: uniqueNamespace,
        subscribeToUpdatesFor: () => ['count'],
      });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().increment();
      store2.getState().setText('Integration Test');

      await waitFor(() => {
        expect(store2.getState().count).toBe(1);
        expect(store1.getState().text).toBe('Integration Test');
      });
    },
  );

  it.skipIf(skip)(
    'should not synchronize state changes between clients in different namespaces',
    async () => {
      const uniqueNamespace1 = createUniqueStoreName('sync-integration-test-1');
      const uniqueNamespace2 = createUniqueStoreName('sync-integration-test-2');
      const store1 = createTestStore({ namespace: uniqueNamespace1 });
      const store2 = createTestStore({ namespace: uniqueNamespace2 });
      const store3 = createTestStore({ namespace: uniqueNamespace1 });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
        expect(store3.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().increment();
      store2.getState().setText('Set by store 2');

      await waitFor(() => {
        expect(store2.getState().count).toBe(0);
        expect(store2.getState().text).toBe('Set by store 2');
        expect(store1.getState().count).toBe(1);
        expect(store1.getState().text).toBe('');
        expect(store3.getState().count).toBe(1);
        expect(store3.getState().text).toBe('');
      });
    },
  );

  it.skipIf(skip)(
    'should not synchronize state changes between clients in same namespaces but differentzFactors',
    async () => {
      const uniqueNamespace = createUniqueStoreName('sync-integration-different-zFactor-test');

      const store1 = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });
      const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });
      const store3 = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
        expect(store3.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().increment();
      store2.getState().setText('Set by store 2');

      await waitFor(() => {
        expect(store2.getState().count).toBe(0);
        expect(store2.getState().text).toBe('Set by store 2');
        expect(store1.getState().count).toBe(1);
        expect(store1.getState().text).toBe('');
        expect(store3.getState().count).toBe(1);
        expect(store3.getState().text).toBe('');
      });
    },
  );

  it.skipIf(skip)('should persist state changes', async () => {
    const uniqueNamespace = createUniqueStoreName('integration-persistence-test');
    const store1 = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
    });

    store1.getState().increment();
    store1.getState().setText('Persistence Test');
    store1.getState().updateNested(99);
    store1.getState().addTodo({ id: '1', text: 'item1', completed: false });
    store1.getState().addTodo({ id: '2', text: 'item2', completed: false });

    await new Promise(resolve => setTimeout(resolve, 100));

    const store2 = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store2.getState().multiplayer.hasHydrated).toBe(true);
    });

    await waitFor(() => {
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Persistence Test');
      expect(store2.getState().nested.value).toBe(99);
      expect(store2.getState().todos).toEqual({
        '1': { id: '1', text: 'item1', completed: false },
        '2': { id: '2', text: 'item2', completed: false },
      });
    });
  });

  it.skipIf(skip)('should clear the store data when clearStorage is called', async () => {
    const uniqueNamespace = createUniqueStoreName('integration-clear-storage-test');
    const store1 = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
    });

    store1.getState().increment();
    store1.getState().setText('Will be cleared');

    await waitFor(async () => {
      const count = await helperClient.get(`${uniqueNamespace}-2:count`);
      const text = await helperClient.get(`${uniqueNamespace}-2:text`);
      expect(count.code).toBe(200);
      expect(text.code).toBe(200);
    });

    await store1.getState().multiplayer.clearStorage();

    await expect(helperClient.get(`${uniqueNamespace}-2:count`)).rejects.toThrow(
      'Record not found',
    );
    await expect(helperClient.get(`${uniqueNamespace}-2:text`)).rejects.toThrow('Record not found');
  });

  it.skipIf(skip)('should call onHydrate handler when store is hydrated', async () => {
    const uniqueNamespace = createUniqueStoreName('integration-onhydrate-test');
    const mockOnHydrate = vi.fn();
    const store = createTestStore({ namespace: uniqueNamespace, onHydrate: mockOnHydrate });
    await waitFor(async () => {
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
      expect(mockOnHydrate).toHaveBeenCalledOnce();
    });
  });

  it.skipIf(skip)('should work with token generation URL', async () => {
    const serverInfo = await createTestServer(
      process.env.HPKV_API_KEY ?? '',
      process.env.HPKV_API_BASE_URL ?? '',
    );

    try {
      const uniqueNamespace = createUniqueStoreName('integration-token-url-test');

      const store1 = createTestStore({
        namespace: uniqueNamespace,
        tokenGenerationUrl: serverInfo.serverUrl,
        apiKey: undefined,
      });

      const store2 = createTestStore({
        namespace: uniqueNamespace,
        tokenGenerationUrl: serverInfo.serverUrl,
        apiKey: undefined,
      });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().increment();
      store1.getState().setText('Token URL Test');

      await waitFor(() => {
        expect(store2.getState().count).toBe(1);
        expect(store2.getState().text).toBe('Token URL Test');
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store2.getState().updateNested(24);

      await waitFor(() => {
        expect(store1.getState().nested.value).toBe(24);
      });
    } finally {
      serverInfo.server.close();
    }
  });
});
