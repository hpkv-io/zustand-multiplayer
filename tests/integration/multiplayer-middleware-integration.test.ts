import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  MultiplayerOptions,
  WithMultiplayer,
  ImmerStateCreator,
  WithMultiplayerMiddleware,
} from '../../src/types/multiplayer-types';
import { LogLevel } from '../../src/monitoring/logger';
import { createUniqueStoreName, waitFor, createTestServer } from '../utils/test-utils';
import { StoreCreator } from '../utils/store-creator';
import { StoreApi, UseBoundStore } from 'zustand';
import { ConnectionState } from '@hpkv/websocket-client';

// Define our test store shape
type TestState = {
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
  removeTodo: (id: string) => void;
};

// Create type for our test store with multiplayer
type TestZustandStore = UseBoundStore<
  WithMultiplayerMiddleware<StoreApi<WithMultiplayer<TestState>>, WithMultiplayer<TestState>>
>;

const initializer: ImmerStateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0 },
  todos: {},
  increment: () =>
    set(state => {
      state.count++;
    }),
  decrement: () =>
    set(state => {
      state.count--;
    }),
  setText: (text: string) => set({ text }),
  updateNested: (value: number) => set({ nested: { value } }),
  addTodo: (todo: { id: string; text: string; completed: boolean }) =>
    set(state => {
      state.todos[todo.id] = todo;
    }),
  removeTodo: (item: string) =>
    set(state => {
      delete state.todos[item];
    }),
});

describe('Multiplayer Middleware Integration Tests', () => {
  const skip = !process.env.HPKV_API_KEY || !process.env.HPKV_API_BASE_URL;

  const storeCreator = new StoreCreator();
  let defaultMultiplayerOptions: Partial<MultiplayerOptions<TestState>>;

  beforeAll(() => {
    defaultMultiplayerOptions = {
      apiKey: process.env.HPKV_API_KEY,
      apiBaseUrl: process.env.HPKV_API_BASE_URL,
      logLevel: LogLevel.DEBUG,
      clientConfig: {
        throttling: {
          enabled: true,
          rateLimit: 20,
        },
      },
    };
  });

  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  function createTestStore(
    options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
  ): TestZustandStore {
    return storeCreator.createStore<TestState>(initializer, {
      ...defaultMultiplayerOptions,
      ...options,
    });
  }

  it.skipIf(skip)('should synchronize state changes between clients', async () => {
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
  });

  it.skipIf(skip)('should persist state across store recreations', async () => {
    const uniqueNamespace = createUniqueStoreName('persistence-test');
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

  it.skipIf(skip)(
    'should detect conflicts and resolves them using remote values by default',
    async () => {
      const uniqueNamespace = createUniqueStoreName('conflict-resolution-default-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({
        namespace: uniqueNamespace,
        subscribeToUpdatesFor: () => ['count'],
      });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      await store2.getState().multiplayer.disconnect();

      store1.getState().setText('store 1 update');
      store1.getState().increment();
      await new Promise(resolve => setTimeout(resolve, 100));
      store2.getState().setText('Missing store1 update');

      await waitFor(() => {
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      //the count value will be 1 because default conflict resolution strategy is keep remote values
      //the text value will be 'Conflict Test' because there are no conflicts
      await waitFor(
        () => {
          expect(store1.getState().text).toBe('store 1 update');
          expect(store1.getState().count).toBe(1);
          expect(store2.getState().text).toBe('store 1 update');
          expect(store2.getState().count).toBe(1);
        },
        { timeout: 10000, interval: 200 },
      );
    },
  );

  it.skipIf(skip)(
    'should detect conflicts and resolves them using merge strategy if provided',
    async () => {
      const uniqueNamespace = createUniqueStoreName('conflict-resolution-test-merge');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({
        namespace: uniqueNamespace,
        onConflict: conflicts => {
          return {
            strategy: 'merge',
            mergedValues: {
              text: conflicts[0].remoteValue + ' ' + conflicts[0].pendingValue,
            },
          };
        },
      });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      await store2.getState().multiplayer.disconnect();
      store1.getState().setText('store 1 update');
      store2.getState().setText('store 2 update');
      await store2.getState().multiplayer.connect();
      await waitFor(() => {
        expect(store2.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      });

      await waitFor(() => {
        expect(store1.getState().text).toBe('store 1 update store 2 update');
        expect(store2.getState().text).toBe('store 1 update store 2 update');
      });
    },
  );

  it.skipIf(skip)('should not receive updates not subscribed for', async () => {
    const uniqueNamespace = createUniqueStoreName('subscribe-to-updates-test');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({
      namespace: uniqueNamespace,
      subscribeToUpdatesFor: () => ['count'],
    });
    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      expect(store2.getState().multiplayer.hasHydrated).toBe(true);
    });
    await waitFor(() => {});

    store1.getState().setText('store 1 update');
    store1.getState().increment();

    await waitFor(() => {
      expect(store1.getState().count).toBe(1);
      expect(store2.getState().count).toBe(1);
      expect(store1.getState().text).toBe('store 1 update');
      expect(store2.getState().text).toBe('');
    });
  });

  it.skipIf(skip)('should clear storage and reset state', async () => {
    const uniqueNamespace = createUniqueStoreName('clear-storage-test');
    const store1 = createTestStore({ namespace: uniqueNamespace });

    // Update state
    store1.getState().increment();
    store1.getState().setText('Will be cleared');

    await waitFor(() => {
      expect(store1.getState().count).toBe(1);
      expect(store1.getState().text).toBe('Will be cleared');
    });

    // Clear storage using the new API pattern
    await store1.getState().multiplayer.clearStorage();

    // Create a new store with the same namespace
    const store2 = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store2.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
    });

    await waitFor(() => {
      expect(store2.getState().count).toBe(0);
      expect(store2.getState().text).toBe('');
    });
  });

  it.skipIf(skip)('should synchroize deleting record entries', async () => {
    const uniqueNamespace = createUniqueStoreName('granular-updates-test');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      expect(store2.getState().multiplayer.hasHydrated).toBe(true);
    });

    store1.getState().addTodo({ id: '1', text: 'item1', completed: false });
    store1.getState().addTodo({ id: '2', text: 'item2', completed: false });

    await waitFor(() => {
      expect(store2.getState().todos).toEqual({
        '1': { id: '1', text: 'item1', completed: false },
        '2': { id: '2', text: 'item2', completed: false },
      });
    });

    store1.getState().removeTodo('1');

    await waitFor(() => {
      expect(store2.getState().todos).toEqual({
        '2': { id: '2', text: 'item2', completed: false },
      });
    });
  });

  it.skipIf(skip)(
    'should synchronize state using token generation URL instead of API key',
    async () => {
      // Set up token generation server
      const serverInfo = await createTestServer(
        process.env.HPKV_API_KEY || '',
        process.env.HPKV_API_BASE_URL || '',
      );

      try {
        const uniqueNamespace = createUniqueStoreName('token-url-test');

        // Create store using token generation URL instead of API key
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
    },
  );
});
