import { describe, it, expect, vi, afterAll } from 'vitest';
import { StateCreator } from 'zustand';
import { createUniqueStoreName, waitFor } from './utils/test-utils';
import {
  ConnectionState,
  MockHPKVClientFactory,
  MockTokenHelper,
  MockWebsocketTokenManager,
} from './mocks';
import { MultiplayerOptions } from '../src/multiplayer';

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

const { StoreCreator } = await import('./utils/store-creator');

type TestState = {
  count: number;
  text: string;
  nested: {
    value: number;
    deep: {
      level: string;
    };
  };
  items: string[];
  increment: () => void;
  setText: (text: string) => void;
  updateNested: (value: number) => void;
  updateDeepNested: (level: string) => void;
  addItem: (item: string) => void;
  clearItems: () => void;
  replaceState: () => void;
};

const initializer: StateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  nested: {
    value: 0,
    deep: {
      level: 'initial',
    },
  },
  items: [],
  increment: () => set(state => ({ count: state.count + 1 })),
  setText: (text: string) => set({ text }),
  updateNested: (value: number) => set(state => ({ nested: { ...state.nested, value } })),
  updateDeepNested: (level: string) =>
    set(state => ({
      nested: {
        ...state.nested,
        deep: { level },
      },
    })),
  addItem: (item: string) => set(state => ({ items: [...state.items, item] })),
  clearItems: () => set({ items: [] }),
  replaceState: () =>
    set(
      () => ({
        count: 999,
        text: 'replaced',
        nested: { value: 999, deep: { level: 'replaced' } },
        items: ['replaced'],
        increment: () => set(state => ({ count: state.count + 1 })),
        setText: (text: string) => set({ text }),
        updateNested: (value: number) => set(state => ({ nested: { ...state.nested, value } })),
        updateDeepNested: (level: string) =>
          set(state => ({
            nested: {
              ...state.nested,
              deep: { level },
            },
          })),
        addItem: (item: string) => set(state => ({ items: [...state.items, item] })),
        clearItems: () => set({ items: [] }),
        replaceState: () => {},
      }),
      true,
    ),
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

describe('Multiplayer Middleware Edge Cases Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  describe('State Replace Operations', () => {
    it('should handle state replacement with replace=true', async () => {
      const uniqueNamespace = createUniqueStoreName('replace-state');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Set some initial state
      store1.getState().increment();
      store1.getState().setText('initial');
      store1.getState().addItem('item1');

      await waitFor(() => {
        expect(store2.getState().count).toBe(1);
        expect(store2.getState().text).toBe('initial');
        expect(store2.getState().items).toEqual(['item1']);
      });

      // Replace entire state
      store1.getState().replaceState();

      await waitFor(() => {
        expect(store2.getState().count).toBe(999);
        expect(store2.getState().text).toBe('replaced');
        expect(store2.getState().nested.value).toBe(999);
        expect(store2.getState().nested.deep.level).toBe('replaced');
        expect(store2.getState().items).toEqual(['replaced']);
      });
    });

    it('should handle partial state replacement', async () => {
      const uniqueNamespace = createUniqueStoreName('partial-replace');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Set initial state
      store1.getState().increment();
      store1.getState().setText('initial');

      await waitFor(() => {
        expect(store2.getState().count).toBe(1);
        expect(store2.getState().text).toBe('initial');
      });

      // Update only text, count should remain
      store1.getState().setText('updated');

      await waitFor(() => {
        expect(store2.getState().count).toBe(1); // Should remain unchanged
        expect(store2.getState().text).toBe('updated');
      });
    });
  });

  describe('Deep Nested State Synchronization', () => {
    it('should synchronize deeply nested object changes', async () => {
      const uniqueNamespace = createUniqueStoreName('deep-nested');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().updateDeepNested('level1');

      await waitFor(() => {
        expect(store2.getState().nested.deep.level).toBe('level1');
      });

      store2.getState().updateNested(42);

      await waitFor(() => {
        expect(store1.getState().nested.value).toBe(42);
        expect(store1.getState().nested.deep.level).toBe('level1'); // Should preserve other nested properties
      });
    });
  });

  describe('Array Operations', () => {
    it('should handle array clearing operations', async () => {
      const uniqueNamespace = createUniqueStoreName('array-clear');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Add items
      store1.getState().addItem('item1');
      store1.getState().addItem('item2');

      await waitFor(() => {
        expect(store2.getState().items).toEqual(['item1', 'item2']);
      });

      // Clear all items
      store1.getState().clearItems();

      await waitFor(() => {
        expect(store2.getState().items).toEqual([]);
      });
    });

    it('should handle rapid array updates', async () => {
      const uniqueNamespace = createUniqueStoreName('rapid-array');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Rapid array updates
      for (let i = 0; i < 10; i++) {
        store1.getState().addItem(`item${i}`);
      }

      await waitFor(() => {
        expect(store2.getState().items.length).toBe(10);
        expect(store2.getState().items).toEqual([
          'item0',
          'item1',
          'item2',
          'item3',
          'item4',
          'item5',
          'item6',
          'item7',
          'item8',
          'item9',
        ]);
      });
    });
  });

  describe('Connection Listener Edge Cases', () => {
    it('should handle multiple connection listeners', async () => {
      const uniqueNamespace = createUniqueStoreName('multiple-listeners');
      const store = createTestStore({ namespace: uniqueNamespace });

      let listener1Called = 0;
      let listener2Called = 0;

      const removeListener1 = store.subscribe(state => {
        if (state.multiplayer.connectionState === ConnectionState.CONNECTED) {
          listener1Called++;
        }
      });

      const removeListener2 = store.subscribe(state => {
        if (state.multiplayer.connectionState === ConnectionState.CONNECTED) {
          listener2Called++;
        }
      });

      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      });

      expect(listener1Called).toBeGreaterThan(0);
      expect(listener2Called).toBeGreaterThan(0);

      removeListener1();
      removeListener2();
    });

    it('should handle listener removal correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('listener-removal');
      const store = createTestStore({ namespace: uniqueNamespace });

      let listenerCalled = 0;
      const removeListener = store.subscribe(state => {
        if (state.multiplayer.connectionState === ConnectionState.CONNECTED) {
          listenerCalled++;
        }
      });

      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      });

      const initialCallCount = listenerCalled;
      removeListener();

      // Trigger a state change
      await store.getState().multiplayer.disconnect();
      await store.getState().multiplayer.connect();

      // Should not increase the call count after removal
      expect(listenerCalled).toBe(initialCallCount);
    });
  });

  describe('Hydration Edge Cases', () => {
    it('should handle hydration with empty state', async () => {
      const uniqueNamespace = createUniqueStoreName('empty-hydration');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store.getState().multiplayer.hasHydrated).toBe(true);
      });

      // State should be at initial values when hydrating from empty storage
      expect(store.getState().count).toBe(0);
      expect(store.getState().text).toBe('');
      expect(store.getState().items).toEqual([]);
    });

    it('should handle multiple hydrate calls gracefully', async () => {
      const uniqueNamespace = createUniqueStoreName('multiple-hydration');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Set some state
      store.getState().increment();
      await new Promise(resolve => setTimeout(resolve, 100));

      const initialCount = store.getState().count;

      // Call hydrate multiple times
      await Promise.all([
        store.getState().multiplayer.hydrate(),
        store.getState().multiplayer.hydrate(),
        store.getState().multiplayer.hydrate(),
      ]);

      // State should remain consistent
      expect(store.getState().count).toBe(initialCount);
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });

    it('should handle onHydrate callback with complex state', async () => {
      const uniqueNamespace = createUniqueStoreName('hydrate-callback');
      let hydratedState: TestState | null = null;

      // Pre-populate storage
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);

      preStore.getState().increment();
      preStore.getState().setText('hydrated');
      preStore.getState().updateNested(42);
      preStore.getState().addItem('test-item');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Create new store with hydration callback
      const store = createTestStore({
        namespace: uniqueNamespace,
        onHydrate: (state: TestState) => {
          hydratedState = { ...state };
        },
      });

      await waitFor(() => {
        expect(store.getState().multiplayer.hasHydrated).toBe(true);
      });

      expect(hydratedState).not.toBeNull();
      expect(hydratedState!.count).toBe(1);
      expect(hydratedState!.text).toBe('hydrated');
      expect(hydratedState!.nested.value).toBe(42);
      expect(hydratedState!.items).toEqual(['test-item']);
    });
  });

  describe('Cleanup and Destruction', () => {
    it('should handle cleanup during active operations', async () => {
      const uniqueNamespace = createUniqueStoreName('cleanup-operations');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Start multiple operations
      const operations = [
        store.getState().increment(),
        store.getState().setText('cleanup-test'),
        store.getState().addItem('cleanup-item'),
      ];

      // Immediately trigger cleanup
      store.getState().multiplayer.destroy();

      // Operations should complete without errors
      await Promise.all(operations);
    });

    it('should handle clearStorage operation', async () => {
      const uniqueNamespace = createUniqueStoreName('clear-storage');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Set some state
      store1.getState().increment();
      store1.getState().setText('before-clear');

      await waitFor(() => {
        expect(store2.getState().count).toBe(1);
        expect(store2.getState().text).toBe('before-clear');
      });

      // Clear storage from store1
      await store1.getState().multiplayer.clearStorage();

      // Both stores should eventually reflect the cleared state
      await waitFor(() => {
        expect(store2.getState().count).toBe(0);
        expect(store2.getState().text).toBe('');
      });
    });
  });

  describe('Function State Updates', () => {
    it('should handle function-based state updates', async () => {
      const uniqueNamespace = createUniqueStoreName('function-updates');
      const store1 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Use function-based state update
      store1.setState(prevState => ({
        ...prevState,
        count: prevState.count + 5,
        text: `updated: ${prevState.count}`,
      }));

      await waitFor(() => {
        expect(store1.getState().count).toBe(5);
        expect(store1.getState().text).toBe('updated: 0');
      });
    });

    it('should handle complex function-based updates', async () => {
      const uniqueNamespace = createUniqueStoreName('complex-function-updates');
      const store1 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Complex state transformation
      store1.setState(prevState => ({
        ...prevState,
        count: prevState.count + 10,
        nested: {
          ...prevState.nested,
          value: prevState.nested.value + 20,
          deep: {
            ...prevState.nested.deep,
            level: `level-${prevState.count}`,
          },
        },
        items: [...prevState.items, `item-${prevState.count}`],
      }));

      await waitFor(() => {
        expect(store1.getState().count).toBe(10);
        expect(store1.getState().nested.value).toBe(20);
        expect(store1.getState().nested.deep.level).toBe('level-0');
        expect(store1.getState().items).toEqual(['item-0']);
      });
    });
  });

  describe('Window Event Handling', () => {
    it('should handle window beforeunload event', async () => {
      const originalWindow = global.window;

      const mockWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as any;

      global.window = mockWindow;

      try {
        const uniqueNamespace = createUniqueStoreName('window-events');
        const store = createTestStore({ namespace: uniqueNamespace });

        await waitFor(() => {
          expect(store.getState().multiplayer.hasHydrated).toBe(true);
        });

        // Verify that beforeunload listener was added
        expect(mockWindow.addEventListener).toHaveBeenCalledWith(
          'beforeunload',
          expect.any(Function),
        );
      } finally {
        global.window = originalWindow;
      }
    });
  });

  describe('Metrics and Performance Tracking', () => {
    it('should track metrics during complex operations', async () => {
      const uniqueNamespace = createUniqueStoreName('metrics-tracking');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store.getState().multiplayer.hasHydrated).toBe(true);
      });

      const initialMetrics = store.getState().multiplayer.getMetrics();

      // Perform multiple operations
      for (let i = 0; i < 5; i++) {
        store.getState().increment();
        store.getState().setText(`text-${i}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMetrics = store.getState().multiplayer.getMetrics();

      // Metrics should have increased
      expect(finalMetrics.stateChangesProcessed).toBeGreaterThan(
        initialMetrics.stateChangesProcessed,
      );
      expect(finalMetrics.averageHydrationTime).toBeGreaterThanOrEqual(0);
    });
  });
});
