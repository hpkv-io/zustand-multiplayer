import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MultiplayerOptions, WithMultiplayer, ImmerStateCreator, WithMultiplayerMiddleware } from '../src/multiplayer';
import { LogLevel } from '../src/logger';
import { createUniqueStoreName, waitFor, createTestServer } from './utils/test-utils';
import { StoreCreator } from './utils/store-creator';
import { StoreApi, UseBoundStore } from 'zustand';
import { ConnectionState } from '@hpkv/websocket-client';

// Define our test store shape
type TestState = {
  count: number;
  text: string;
  nested: {
    value: number;
  };
  items: Record<string, string>;
  increment: () => void;
  decrement: () => void;
  setText: (text: string) => void;
  updateNested: (value: number) => void;
  addItem: (item: string) => void;
};

// Create type for our test store with multiplayer
type TestZustandStore = UseBoundStore<WithMultiplayerMiddleware<StoreApi<WithMultiplayer<TestState>>, WithMultiplayer<TestState>>>;

const initializer: ImmerStateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0 },
  items: {},
  increment: () => set(state => { state.count++; }),
  decrement: () => set(state => { state.count--; }),
  setText: (text: string) => set({ text }),
  updateNested: (value: number) => set({ nested: { value } }),
  addItem: (item: string) => set(state => { state.items[item] = item; }),
});

describe('Multiplayer Middleware Integration Tests', () => {
  // Skip tests if environment variables are not set
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
          rateLimit: 10,
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
    const store2 = createTestStore({ namespace: uniqueNamespace });

    console.log('Waiting for stores to hydrate...');
    // Wait for first store to be ready
    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      expect(store2.getState().multiplayer.hasHydrated).toBe(true);
    });

    console.log('Both stores hydrated. Checking connection states...');
    console.log('Store1 connection state:', store1.getState().multiplayer.connectionState);
    console.log('Store2 connection state:', store2.getState().multiplayer.connectionState);

    // Wait for websocket subscriptions to be fully established
    console.log('Waiting for websocket subscriptions to be fully established...');
    await waitFor(() => {
      console.log('Store1 subscription ready:', store1.getState().multiplayer.isSubscriptionReady);
      console.log('Store2 subscription ready:', store2.getState().multiplayer.isSubscriptionReady);
      expect(store1.getState().multiplayer.isSubscriptionReady).toBe(true);
      expect(store2.getState().multiplayer.isSubscriptionReady).toBe(true);
    }, { timeout: 5000, interval: 100 });

    console.log('Setting count to 1 by store1');
    console.log('Store1 count before increment:', store1.getState().count);
    console.log('Store2 count before increment:', store2.getState().count);

    store1.getState().increment();
    
    console.log('Store1 count after increment:', store1.getState().count);
    console.log('Store2 count after increment (should still be 0):', store2.getState().count);
    
    console.log('Waiting for store2 to receive the change notification...');
    await waitFor(() => {
      console.log('Store2 current count:', store2.getState().count);
      expect(store2.getState().count).toBe(1);
    }, { timeout: 10000, interval: 100 });

    console.log('Setting text to Integration Test by store2');
    console.log('Store1 text before setText:', store1.getState().text);
    console.log('Store2 text before setText:', store2.getState().text);

    store2.getState().setText('Integration Test');

    console.log('Store1 text after setText (should still be empty):', store1.getState().text);
    console.log('Store2 text after setText:', store2.getState().text);

    console.log('Waiting for store1 to receive the change notification...');
    await waitFor(() => {
      console.log('Store1 current text:', store1.getState().text);
      expect(store1.getState().text).toBe('Integration Test');
    }, { timeout: 10000, interval: 100 });

    console.log('Test completed successfully!');
  });

  it.skipIf(skip)('should persist state across store recreations', async () => {
    const uniqueNamespace = createUniqueStoreName('persistence-test');
    const store1 = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
    });

    // Update state
    store1.getState().increment();
    store1.getState().setText('Persistence Test');
    store1.getState().updateNested(99);
    store1.getState().addItem('item1');
    store1.getState().addItem('item2');

    await new Promise(resolve => setTimeout(resolve, 100));

    await store1.getState().multiplayer.disconnect();
    await store1.getState().multiplayer.connect();

    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
    });

    await waitFor(() => {
      expect(store1.getState().count).toBe(1);
      expect(store1.getState().text).toBe('Persistence Test');
      expect(store1.getState().nested.value).toBe(99);
      expect(store1.getState().items).toEqual({ item1: 'item1', item2: 'item2' });
    });
  });

  it.skipIf(skip)('should hydrate state from persistent storage on creation', async () => {
    const uniqueNamespace = createUniqueStoreName('conflict-resolution-test');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
    });

    store1.getState().increment();
    store1.getState().setText('Hydration Test');
    store1.getState().updateNested(99);
    store1.getState().addItem('item1');
    store1.getState().addItem('item2');

    // Wait for all changes to be synced to the server
    await new Promise(resolve => setTimeout(resolve, 500));

    const store2 = createTestStore({ namespace: uniqueNamespace });
    await waitFor(() => {
      expect(store2.getState().multiplayer.hasHydrated).toBe(true);
    });

    await waitFor(() => {
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Hydration Test');
      expect(store2.getState().nested.value).toBe(99);
      expect(store2.getState().items).toEqual({ item1: 'item1', item2: 'item2' });
    });
  });

  it.skipIf(skip)(
    'should detect conflicts and resolves them using remote values by default',
    async () => {
      const uniqueNamespace = createUniqueStoreName('conflict-resolution-default-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });
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
    'should detect conflicts and resolves them using keep-local strategy if provided',
    async () => {
      const uniqueNamespace = createUniqueStoreName('conflict-resolution-test-keep-local');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({
        namespace: uniqueNamespace,
        onConflict: conflicts => {
          return {
            strategy: 'keep-local',
          };
        },
      });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      });

      await waitFor(() => {
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      await store2.getState().multiplayer.disconnect();

      store1.getState().setText('store 1 update');
      await new Promise(resolve => setTimeout(resolve, 100));
      store2.getState().setText('store 2 update');
      await waitFor(() => {
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      await waitFor(
        () => {
          expect(store1.getState().text).toBe('store 2 update');
          expect(store2.getState().text).toBe('store 2 update');
        },
        { timeout: 30000 },
      );
    },
  );

  it.skipIf(skip)(
    'should detect conflicts and resolves them using keepRemote strategy if provided',
    async () => {
      const uniqueNamespace = createUniqueStoreName('conflict-resolution-test-keepRemote');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({
        namespace: uniqueNamespace,
        onConflict: conflicts => {
          return {
            strategy: 'keep-remote',
          };
        },
      });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      });
      await waitFor(() => {
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      await store2.getState().multiplayer.disconnect();

      store1.getState().setText('store 1 update');
      await new Promise(resolve => setTimeout(resolve, 100));
      store2.getState().setText('store 2 update');
      await waitFor(() => {
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      await waitFor(
        () => {
          expect(store1.getState().text).toBe('store 1 update');
          expect(store2.getState().text).toBe('store 1 update');
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
        expect(store1.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
        expect(store2.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      });

      await store2.getState().multiplayer.disconnect();
      store1.getState().setText('store 1 update');
      store2.getState().setText('store 2 update');

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
      expect(store1.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
    });
    await waitFor(() => {
      expect(store2.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
    });

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

        // Wait for first store to be ready
        await waitFor(() => {
          expect(store1.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
        });

        // Update state in first store
        store1.getState().increment();
        store1.getState().setText('Token URL Test');

        // Create second store with same namespace
        const store2 = createTestStore({
          namespace: uniqueNamespace,
          tokenGenerationUrl: serverInfo.serverUrl,
          apiKey: undefined,
        });

        // Wait for second store to sync
        await waitFor(() => {
          expect(store2.getState().count).toBe(1);
          expect(store2.getState().text).toBe('Token URL Test');
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
        });

        // Update from second store
        store2.getState().updateNested(24);

        // Verify first store received update
        await waitFor(() => {
          expect(store1.getState().nested.value).toBe(24);
        });
      } finally {
        // Clean up the server
        serverInfo.server.close();
      }
    },
  );

  it.skipIf(skip)('should provide connection status through multiplayer state', async () => {
    const uniqueNamespace = createUniqueStoreName('connection-status-test');
    const store = createTestStore({ namespace: uniqueNamespace });

    // Wait for store to be ready
    await waitFor(() => {
      expect(store.getState().count).toBeDefined();
    });

    // Access connection status through the new API pattern
    const connectionStatus = store.getState().multiplayer.getConnectionStatus();
    expect(connectionStatus).toBeDefined();
  });
});
