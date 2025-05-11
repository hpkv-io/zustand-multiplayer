import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { MultiplayerOptions, MultiplayerStore } from '../src/multiplayer';
import { createUniqueStoreName, waitFor, createTestServer } from './utils/test-utils';
import { StateCreator } from 'zustand';
import { StoreCreator } from './utils/store-creator';
import { StoreApi, UseBoundStore } from 'zustand';
import { Write } from '../src/multiplayer';

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
  removeItem: (item: string) => void;
};

// Create type for our test store
type TestZustandStore = UseBoundStore<Write<StoreApi<TestState>, MultiplayerStore<TestState>>>;

const initializer: StateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0 },
  items: {},
  increment: () => set(state => ({ count: state.count + 1 })),
  decrement: () => set(state => ({ count: state.count - 1 })),
  setText: (text: string) => set({ text }),
  updateNested: (value: number) => set({ nested: { value } }),
  addItem: (item: string) => set(state => ({ items: { ...state.items, [item]: item } })),
  removeItem: (item: string) =>
    set(state => ({
      items: { ...Object.fromEntries(Object.entries(state.items).filter(([key]) => key !== item)) },
    })),
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
    };
  });

  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  afterEach(async () => {
    // Clean up stores after each test to avoid interference
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

  it.skipIf(skip)(
    'should synchronize state changes between instances with real HPKV connection',
    async () => {
      const uniqueNamespace = createUniqueStoreName('real-hpkv-integration');
      const store1 = createTestStore({ namespace: uniqueNamespace });

      // Wait for first store to be ready
      await waitFor(() => {
        expect(store1.getState().count).toBeDefined();
      });

      // Update state in first store
      store1.getState().increment();
      store1.getState().setText('Integration Test');

      // Create second store with same namespace
      const store2 = createTestStore({ namespace: uniqueNamespace });

      // Wait for second store to sync
      await waitFor(() => {
        expect(store2.getState().count).toBe(1);
        expect(store2.getState().text).toBe('Integration Test');
      });

      // Update from second store
      store2.getState().updateNested(42);

      // Verify first store received update
      await waitFor(() => {
        expect(store1.getState().nested.value).toBe(42);
      });
    },
  );

  it.skipIf(skip)('should persist state across store recreations', async () => {
    const uniqueNamespace = createUniqueStoreName('persistence-test');
    let store1 = createTestStore({ namespace: uniqueNamespace });

    // Update state
    store1.getState().increment();
    store1.getState().setText('Persistence Test');
    store1.getState().updateNested(99);
    store1.getState().addItem('item1');
    store1.getState().addItem('item2');

    await waitFor(() => {
      expect(store1.getState().count).toBe(1);
      expect(store1.getState().text).toBe('Persistence Test');
      expect(store1.getState().nested.value).toBe(99);
      expect(store1.getState().items).toEqual({ item1: 'item1', item2: 'item2' });
    });

    // Create a new store with the same namespace
    let store2 = createTestStore({ namespace: uniqueNamespace });
    store1.getState().removeItem('item1');

    await waitFor(() => {
      expect(store1.getState().items).toEqual({ item2: 'item2' });
    });

    await store2.multiplayer.hydrate();

    // Wait for hydration from persistent storage
    await waitFor(() => {
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Persistence Test');
      expect(store2.getState().nested.value).toBe(99);
      expect(store2.getState().items).toEqual({ item2: 'item2' });
    });
  });

  it.skipIf(skip)('should clear storage and reset state', async () => {
    const uniqueNamespace = createUniqueStoreName('clear-storage-test');
    const store1 = createTestStore({ namespace: uniqueNamespace });

    // Wait for store to be ready
    await waitFor(() => {
      return store1.getState().count !== undefined;
    });

    // Update state
    store1.getState().increment();
    store1.getState().setText('Will be cleared');

    // Clear storage
    await store1.multiplayer.clearStorage();

    // Create a new store with the same namespace
    const store2 = createTestStore({ namespace: uniqueNamespace });

    // Wait for some time to make sure hydration would have completed
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify state is reset to initial values
    expect(store2.getState().count).toBe(0);
    expect(store2.getState().text).toBe('');
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
          // Explicitly set apiKey to undefined to ensure we're using tokenGenerationUrl
          apiKey: undefined,
        });

        // Wait for first store to be ready
        await waitFor(() => {
          expect(store1.getState().count).toBeDefined();
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
});
