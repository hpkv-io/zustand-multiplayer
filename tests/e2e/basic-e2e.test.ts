import { ConnectionState, HPKVApiClient, HPKVClientFactory } from '@hpkv/websocket-client';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { create, type StateCreator, type UseBoundStore } from 'zustand';
import type {
  MultiplayerOptions,
  MultiplayerStoreApi,
  WithMultiplayer,
} from '../../src/types/multiplayer-types';
import { StoreCreator } from '../utils/store-creator';
import { createUniqueStoreName, waitFor, createTestServer } from '../utils/test-utils';
import { multiplayer } from '../../src/multiplayer';

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
  toggleTodo: (id: string) => void;
}

type TestZustandStore = UseBoundStore<MultiplayerStoreApi<WithMultiplayer<TestState>>>;

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
  toggleTodo: (id: string) =>
    set(state => ({
      todos: {
        ...state.todos,
        [id]: {
          ...state.todos[id],
          completed: !state.todos[id].completed,
        },
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

  describe('Store Creation Tests', () => {
    it('should create a zustand store with initial state', () => {
      const store = createTestStore();
      expect(store.getState().count).toBe(0);
      expect(store.getState().text).toBe('');
      expect(store.getState().nested.value).toBe(0);
    });

    it('should have multiplayer state with all required properties', () => {
      const store = createTestStore();
      const multiplayerState = store.getState().multiplayer;
      const multiplayerApi = store.multiplayer;

      expect(multiplayerState).toBeDefined();
      expect(typeof multiplayerState.connectionState).toBe('string');
      expect(typeof multiplayerState.hasHydrated).toBe('boolean');
      expect(typeof multiplayerApi.disconnect).toBe('function');
      expect(typeof multiplayerApi.clearStorage).toBe('function');
      expect(typeof multiplayerApi.getMetrics).toBe('function');
      expect(typeof multiplayerApi.getConnectionStatus).toBe('function');
      expect(typeof multiplayerApi.connect).toBe('function');
      expect(typeof multiplayerApi.reHydrate).toBe('function');
      expect(typeof multiplayerApi.destroy).toBe('function');
    });

    it('should throw error when neither apiKey nor tokenGenerationUrl is provided', () => {
      expect(() => {
        create<WithMultiplayer<TestState>>()(
          multiplayer(initializer, {
            namespace: 'test',
            apiBaseUrl: 'https://api.example.com',
          }),
        );
      }).toThrow('Either apiKey or tokenGenerationUrl must be provided');
    });

    it('should create a store with tokenGenerationUrl', async () => {
      const serverInfo = await createTestServer(
        process.env.HPKV_API_KEY ?? '',
        process.env.HPKV_API_BASE_URL ?? '',
      );

      const store = storeCreator.createStore<TestState>(initializer, {
        namespace: createUniqueStoreName('token-url-test'),
        tokenGenerationUrl: serverInfo.serverUrl,
        apiBaseUrl: process.env.HPKV_API_BASE_URL,
        apiKey: undefined,
      });

      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      });
    });

    it('should create a store with apiKey', async () => {
      const store = storeCreator.createStore<TestState>(initializer, {
        namespace: createUniqueStoreName('api-key-test'),
        apiBaseUrl: process.env.HPKV_API_BASE_URL,
        apiKey: process.env.HPKV_API_KEY,
      });
      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState === ConnectionState.CONNECTED).toBe(
          true,
        );
      });
    });

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

    it('should hydrate nested states correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('nested-persistence-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store1.getState().multiplayer.hasHydrated);
      store1.getState().updateNested(42);
      await new Promise(resolve => setTimeout(resolve, 100));

      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);
      expect(store2.getState().nested.value).toBe(42);
    });

    it('should have performance metrics available', () => {
      const store = createTestStore();
      const metrics = store.multiplayer.getMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics.averageSyncTime).toBe('number');
    });

    it('should have connection status available', () => {
      const store = createTestStore();
      const status = store.multiplayer.getConnectionStatus();

      expect(status).toBeDefined();
      if (status) {
        expect(typeof status.isConnected).toBe('boolean');
        expect(typeof status.connectionState).toBe('string');
        expect(typeof status.reconnectAttempts).toBe('number');
        expect(typeof status.messagesPending).toBe('number');
      }
    });
  });

  describe('Basic Sync & Persistence Tests', () => {
    it.skipIf(skip)(
      'should synchronize state changes between clients in the same namespace',
      async () => {
        const uniqueNamespace = createUniqueStoreName('sync-primitives-test');
        const store1 = createTestStore({ namespace: uniqueNamespace });
        const store2 = createTestStore({ namespace: uniqueNamespace });
        await waitFor(() => store1.getState().multiplayer.hasHydrated);
        await waitFor(() => store2.getState().multiplayer.hasHydrated);

        store1.getState().increment();
        store2.getState().setText('Synced Text');

        await waitFor(() => {
          expect(store1.getState().text).toBe('Synced Text');
          expect(store2.getState().count).toBe(1);
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

    it.skipIf(skip)('should synchronize primitive value changes between clients', async () => {
      const uniqueNamespace = createUniqueStoreName('sync-primitive-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store1.getState().multiplayer.hasHydrated);
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      store1.getState().increment();
      store2.getState().setText('Set by Store 2');

      await waitFor(() => expect(store2.getState().count).toBe(1));
      await waitFor(() => expect(store1.getState().text).toBe('Set by Store 2'));
    });

    it('should synchronize nested object changes between clients', async () => {
      const uniqueNamespace = createUniqueStoreName('sync-nested-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store1.getState().multiplayer.hasHydrated);
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      store1.getState().updateNested(100);
      await waitFor(() => expect(store2.getState().nested.value).toBe(100));
    });

    it('should synchronize record changes between clients', async () => {
      const uniqueNamespace = createUniqueStoreName('sync-nested-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store1.getState().multiplayer.hasHydrated);
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      store1.getState().addTodo({ id: '1', text: 'ToDo', completed: false });
      await waitFor(() => expect(store2.getState().todos['1'].text).toBe('ToDo'));
      store2.getState().toggleTodo('1');
      await waitFor(() => expect(store2.getState().todos['1'].completed).toBe(true));
    });

    it.skipIf(skip)('should sync when connected with token generation URL', async () => {
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

    it('should create keys with correct namespace formatting', async () => {
      const uniqueNamespace = createUniqueStoreName('storage-keys-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      store.getState().increment();
      store.getState().setText('Test Text');
      store.getState().updateNested(25);
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(helperClient.get(`${uniqueNamespace}-2:count`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:text`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:nested:value`)).resolves.toHaveProperty(
        'code',
        200,
      );
    });

    it('should not persist function properties', async () => {
      const uniqueNamespace = createUniqueStoreName('no-function-sync-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);
      store.getState().increment();
      store.getState().setText('Synced Text');
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(helperClient.get(`${uniqueNamespace}-2:count`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:increment`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:decrement`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:setText`)).rejects.toThrow(
        'Record not found',
      );
    });

    it('should handle rapid state updates', async () => {
      const uniqueNamespace = createUniqueStoreName('rapid-updates-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store1.getState().multiplayer.hasHydrated);
      await waitFor(() => store2.getState().multiplayer.hasHydrated);
      for (let i = 0; i < 10; i++) {
        store1.getState().increment();
      }

      await waitFor(() => {
        expect(store2.getState().count).toBe(10);
      });
    });
  });

  describe('Multiplayer API Tests', () => {
    it('should connect when connect method is called', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-connect-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store.getState().multiplayer.hasHydrated).toBe(true);
      });

      await store.multiplayer.disconnect();

      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.DISCONNECTED);
      });

      await store.multiplayer.connect();

      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      });
    });

    it.skipIf(skip)('should disconnect when disconnect is called', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-disconnect-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store.getState().multiplayer.hasHydrated).toBe(true);
      });

      await store.multiplayer.disconnect();

      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.DISCONNECTED);
      });
    });

    it('should track connection state changes', async () => {
      const store = createTestStore();
      await waitFor(() => expect(store.getState().multiplayer.hasHydrated).toBe(true));

      await store.multiplayer.disconnect();
      expect(store.getState().multiplayer.connectionState).toBe('DISCONNECTED');

      await store.multiplayer.connect();
      expect(store.getState().multiplayer.connectionState).toBe('CONNECTED');
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

      await store1.multiplayer.clearStorage();

      await expect(helperClient.get(`${uniqueNamespace}-2:count`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:text`)).rejects.toThrow(
        'Record not found',
      );
    });
  });
});
