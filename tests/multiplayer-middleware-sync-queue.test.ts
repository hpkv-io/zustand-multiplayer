import { describe, it, expect, vi, afterAll } from 'vitest';
import { MultiplayerOptions } from '../src/multiplayer';
import { StateCreator } from 'zustand';
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

const { StoreCreator } = await import('./utils/store-creator');

type TestState = {
  count: number;
  text: string;
  timestamp: number;
  items: string[];
  complexCounter: {
    value: number;
    lastModified: number;
  };
  increment: (count?: number) => void;
  decrement: (count?: number) => void;
  setText: (text: string) => void;
  updateTimestamp: () => void;
  addItem: (item: string) => void;
  removeItem: (item: string) => void;
  incrementComplex: () => void;
  reset: () => void;
};

const initializer: StateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  timestamp: 0,
  items: [],
  complexCounter: {
    value: 0,
    lastModified: 0,
  },
  increment: (count = 1) => set(state => ({ count: state.count + count })),
  decrement: (count = 1) => set(state => ({ count: state.count - count })),
  setText: (text: string) => set({ text }),
  updateTimestamp: () => set({ timestamp: Date.now() }),
  addItem: (item: string) => set(state => ({ items: [...state.items, item] })),
  removeItem: (item: string) => set(state => ({ items: state.items.filter(i => i !== item) })),
  incrementComplex: () =>
    set(state => ({
      complexCounter: {
        value: state.complexCounter.value + 1,
        lastModified: Date.now(),
      },
    })),
  reset: () =>
    set({
      count: 0,
      text: '',
      timestamp: 0,
      items: [],
      complexCounter: { value: 0, lastModified: 0 },
    }),
});

const storeCreator = new StoreCreator();

function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, {
    apiKey: 'test-api-key',
    apiBaseUrl: 'hpkv-base-api-url',
    ...options,
  });
}

describe('Multiplayer Middleware Sync Queue Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  describe('Offline State Management', () => {
    it('should queue state changes when disconnected', async () => {
      const uniqueNamespace = createUniqueStoreName('offline-queue');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Disconnect the store
      await store.getState().multiplayer.disconnect();
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.DISCONNECTED);

      // Perform state changes while offline
      store.getState().increment();
      store.getState().increment();
      store.getState().setText('offline-text');
      store.getState().addItem('offline-item-1');
      store.getState().addItem('offline-item-2');
      // Reconnect
      await waitFor(
        () => store.getState().multiplayer.connectionState === ConnectionState.CONNECTED,
      );

      // Create another store to verify synchronization
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);
      await new Promise(resolve => setTimeout(resolve, 100));
      // Changes should be synchronized
      expect(store2.getState().count).toBe(2);
      expect(store2.getState().text).toBe('offline-text');
      expect(store2.getState().items).toEqual(['offline-item-1', 'offline-item-2']);
    });

    it('should handle rapid offline state changes', async () => {
      const uniqueNamespace = createUniqueStoreName('rapid-offline');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Disconnect
      await store.getState().multiplayer.disconnect();

      // Perform rapid changes
      for (let i = 0; i < 20; i++) {
        store.getState().increment();
        store.getState().setText(`rapid-${i}`);
        store.getState().addItem(`item-${i}`);
      }
      // Reconnect
      await store.getState().multiplayer.connect();

      // Create second store to verify sync
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      await waitFor(() => expect(store2.getState().count).toBe(20));
      await waitFor(() => expect(store2.getState().text).toBe('rapid-19'));
      await waitFor(() => expect(store2.getState().items.length).toBe(20));
    });
  });

  describe('State Change Queuing During Connection Issues', () => {
    it('should queue changes during reconnection attempts', async () => {
      const uniqueNamespace = createUniqueStoreName('reconnection-queue');
      const store = createTestStore({
        namespace: uniqueNamespace,
        clientConfig: {
          maxReconnectAttempts: 5,
        },
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Simulate connection loss
      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      client.simulateDisconnect();

      // Make changes during reconnection process
      store.getState().increment();
      store.getState().setText('during-reconnection');
      store.getState().addItem('reconnection-item');

      // Wait for reconnection
      await waitFor(
        () => store.getState().multiplayer.connectionState === ConnectionState.CONNECTED,
      );

      // Create second store to verify changes were synchronized
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('during-reconnection');
      expect(store2.getState().items).toEqual(['reconnection-item']);
    });

    it('should handle state changes during slow connection establishment', async () => {
      const uniqueNamespace = createUniqueStoreName('slow-connection');

      // Set high operation delay to simulate slow connection
      const preClient = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      if (preClient) {
        preClient.setOperationDelay(500);
      }

      const store = createTestStore({ namespace: uniqueNamespace });

      // Make changes before hydration completes
      store.getState().increment();
      store.getState().setText('before-hydration');

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Reset delay
      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      client.setOperationDelay(10);

      await waitFor(() => expect(store.getState().count).toBe(1));
      await waitFor(() => expect(store.getState().text).toBe('before-hydration'));

      // Create second store to verify sync
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      await waitFor(() => expect(store2.getState().count).toBe(1));
      await waitFor(() => expect(store2.getState().text).toBe('before-hydration'));
    });
  });

  describe('Complex State Updates While Offline', () => {
    it('should handle array operations while offline', async () => {
      const uniqueNamespace = createUniqueStoreName('offline-arrays');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Add initial items
      store.getState().addItem('initial-1');
      store.getState().addItem('initial-2');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Disconnect
      await store.getState().multiplayer.disconnect();

      // Perform array operations offline
      store.getState().addItem('offline-1');
      store.getState().addItem('offline-2');
      store.getState().removeItem('initial-1');
      store.getState().addItem('offline-3');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify sync
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);
      await waitFor(() =>
        expect(store2.getState().items).toEqual([
          'initial-2',
          'offline-1',
          'offline-2',
          'offline-3',
        ]),
      );
    });
  });

  describe('State Conflict Resolution with Queued Changes', () => {
    it('should handle merge conflicts with complex state', async () => {
      const uniqueNamespace = createUniqueStoreName('complex-conflict');
      const store1 = createTestStore({
        namespace: uniqueNamespace,
        onConflict: conflicts => ({
          strategy: 'merge',
          mergedValues: {
            text:
              conflicts.find(c => c.field === 'text')?.remoteValue +
              ' + ' +
              conflicts.find(c => c.field === 'text')?.pendingValue,
            count: Math.max(
              (conflicts.find(c => c.field === 'count')?.remoteValue as number) || 0,
              (conflicts.find(c => c.field === 'count')?.pendingValue as number) || 0,
            ),
          },
        }),
      });

      const store2 = createTestStore({
        namespace: uniqueNamespace,
        onConflict: conflicts => ({
          strategy: 'merge',
          mergedValues: {
            text:
              conflicts.find(c => c.field === 'text')?.remoteValue +
              ' + ' +
              conflicts.find(c => c.field === 'text')?.pendingValue,
            count: Math.max(
              (conflicts.find(c => c.field === 'count')?.remoteValue as number) || 0,
              (conflicts.find(c => c.field === 'count')?.pendingValue as number) || 0,
            ),
          },
        }),
      });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Disconnect store2
      await store2.getState().multiplayer.disconnect();

      // Both make changes
      store1.getState().setText('remote');
      store1.getState().increment(5);

      await new Promise(resolve => setTimeout(resolve, 100));

      store2.getState().setText('local');
      store2.getState().increment(3);

      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        // Both should have merged values
        expect(store1.getState().text).toBe('remote + local');
        expect(store2.getState().text).toBe('remote + local');
        expect(store1.getState().count).toBe(5); // Max of 5 and 3
        expect(store2.getState().count).toBe(5);
      });
    });
  });

  describe('Sync Queue Edge Cases', () => {
    it('should handle empty queue processing', async () => {
      const uniqueNamespace = createUniqueStoreName('empty-queue');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Disconnect and reconnect without making changes
      await store.getState().multiplayer.disconnect();
      await store.getState().multiplayer.connect();

      // Should handle gracefully without errors
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      await waitFor(() => store.getState().multiplayer.hasHydrated);
    });

    it('should handle rapid disconnect/reconnect cycles', async () => {
      const uniqueNamespace = createUniqueStoreName('rapid-cycles');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Rapid disconnect/reconnect cycles with state changes
      for (let i = 0; i < 3; i++) {
        await store.getState().multiplayer.disconnect();
        store.getState().increment();
        store.getState().setText(`cycle-${i}`);
        await store.getState().multiplayer.connect();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // State should be consistent
      expect(store.getState().count).toBe(3);
      expect(store.getState().text).toBe('cycle-2');

      // Verify with second store
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      expect(store2.getState().count).toBe(3);
      expect(store2.getState().text).toBe('cycle-2');
    });

    it('should preserve state order during offline operations', async () => {
      const uniqueNamespace = createUniqueStoreName('state-order');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Disconnect
      await store.getState().multiplayer.disconnect();

      // Sequential operations that depend on order
      store.getState().increment(); // count = 1
      store.getState().increment(); // count = 2
      store.getState().increment(); // count = 3
      store.getState().decrement(); // count = 2

      // Verify sync maintains order
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store2.getState().multiplayer.hasHydrated);
      await new Promise(resolve => setTimeout(resolve, 100));
      await waitFor(() => expect(store2.getState().count).toBe(2));
    });
  });
});
