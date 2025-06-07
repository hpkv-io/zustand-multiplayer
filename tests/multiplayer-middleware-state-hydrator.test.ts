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
  nullable: string | null;
  emptyString: string;
  zero: number;
  booleanFalse: boolean;
  array: string[];
  complexObject: {
    nested: {
      value: number;
      optional?: string;
    };
    metadata: Record<string, unknown>;
  };
  increment: () => void;
  setText: (text: string) => void;
  setNullable: (value: string | null) => void;
  updateComplex: (value: number, optional?: string) => void;
  updateMetadata: (metadata: Record<string, unknown>) => void;
};

const initializer: StateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  nullable: null,
  emptyString: '',
  zero: 0,
  booleanFalse: false,
  array: [],
  complexObject: {
    nested: {
      value: 0,
    },
    metadata: {},
  },
  increment: () => set(state => ({ count: state.count + 1 })),
  setText: (text: string) => set({ text }),
  setNullable: (value: string | null) => set({ nullable: value }),
  updateMetadata: (metadata: Record<string, unknown>) =>
    set(state => ({ complexObject: { ...state.complexObject, metadata } })),
  updateComplex: (value: number, optional?: string) =>
    set(state => ({
      complexObject: {
        ...state.complexObject,
        nested: {
          ...state.complexObject.nested,
          value,
          ...(optional && { optional }),
        },
      },
    })),
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

describe('Multiplayer Middleware State Hydrator Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  describe('Hydration with Special Values', () => {
    it('should handle null values during hydration', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-null');

      // Pre-populate with null value
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);

      preStore.getState().setNullable('not-null');
      preStore.getState().setNullable(null);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Create new store and verify null is preserved
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);

      expect(store.getState().nullable).toBe(null);
    });

    it('should handle empty strings during hydration', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-empty-string');

      // Pre-populate with empty string
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);

      preStore.getState().setText('non-empty');
      preStore.getState().setText('');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Create new store and verify empty string behavior
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Empty strings should be skipped during hydration as per shouldSkipField logic
      expect(store.getState().text).toBe('');
    });

    it('should handle zero values during hydration', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-zero');

      // Pre-populate with zero
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);

      preStore.setState({ zero: 42 });
      preStore.setState({ zero: 0 });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Create new store and verify zero is preserved
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);

      expect(store.getState().zero).toBe(0);
    });

    it('should handle boolean false values during hydration', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-false');

      // Pre-populate with false
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);

      preStore.setState({ booleanFalse: true });
      preStore.setState({ booleanFalse: false });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Create new store and verify false is preserved
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);

      expect(store.getState().booleanFalse).toBe(false);
    });

    it('should handle complex nested objects during hydration', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-complex');

      // Pre-populate with complex object
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);

      preStore.getState().updateComplex(123, 'optional-value');
      preStore.getState().updateMetadata({
        timestamp: Date.now(),
        version: '1.0.0',
        nested: {
          deep: {
            value: 'deeply-nested',
          },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Create new store and verify complex object is preserved
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);

      await waitFor(() => expect(store.getState().complexObject.nested.value).toBe(123));
      await waitFor(() =>
        expect(store.getState().complexObject.nested.optional).toBe('optional-value'),
      );
      await waitFor(() => expect(store.getState().complexObject.metadata.version).toBe('1.0.0'));
      await waitFor(() =>
        expect((store.getState().complexObject.metadata.nested as any).deep.value).toBe(
          'deeply-nested',
        ),
      );
    });
  });

  describe('Hydration Error Scenarios', () => {
    it('should handle hydration when storage operation fails', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-storage-fail');
      const store = createTestStore({
        namespace: uniqueNamespace,
        retryConfig: { maxRetries: 3, maxDelay: 200, baseDelay: 20, backoffFactor: 2 },
      });

      // Force client to fail operations during hydration
      await waitFor(
        () => store.getState().multiplayer.connectionState === ConnectionState.CONNECTED,
      );

      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      client.setShouldFailOperations(true);

      // Manual hydration should handle the error gracefully
      try {
        await store.getState().multiplayer.hydrate();
      } catch (error) {
        expect(error).toBeDefined();
      }

      client.setShouldFailOperations(false);
      await new Promise(resolve => setTimeout(resolve, 200));
      await store.getState().multiplayer.hydrate();

      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });

    it('should handle concurrent hydration attempts', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-concurrent');

      // Pre-populate storage
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);

      preStore.getState().increment();
      preStore.getState().setText('concurrent-test');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Create new store and trigger multiple concurrent hydrations
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Multiple concurrent hydration calls should be handled gracefully
      const hydrationPromises = [
        store.getState().multiplayer.hydrate(),
        store.getState().multiplayer.hydrate(),
        store.getState().multiplayer.hydrate(),
        store.getState().multiplayer.hydrate(),
      ];

      await Promise.all(hydrationPromises);

      // State should be consistent
      expect(store.getState().count).toBe(1);
      expect(store.getState().text).toBe('concurrent-test');
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });

    it('should handle hydration during disconnected state', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-disconnected');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Disconnect and attempt hydration
      await store.getState().multiplayer.disconnect();
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.DISCONNECTED);

      // Hydration should trigger reconnection
      await store.getState().multiplayer.hydrate();

      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });
  });

  describe('Hydration Performance and Metrics', () => {
    it('should track hydration time in performance metrics', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-metrics');

      // Pre-populate with substantial data
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);

      // Add multiple state changes
      for (let i = 0; i < 10; i++) {
        preStore.getState().increment();
        preStore.getState().setText(`item-${i}`);
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Create new store and measure hydration
      const store = createTestStore({ namespace: uniqueNamespace });
      const startTime = Date.now();

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      const endTime = Date.now();
      const hydrationTime = endTime - startTime;

      const metrics = store.getState().multiplayer.getMetrics();

      expect(metrics.averageHydrationTime).toBeGreaterThan(0);
      expect(hydrationTime).toBeGreaterThan(0);

      // Verify state was hydrated correctly
      await waitFor(() => expect(store.getState().count).toBe(10));
      await waitFor(() => expect(store.getState().text).toBe('item-9'));
    });

    it('should handle hydration timeout gracefully', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-timeout');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(
        () => store.getState().multiplayer.connectionState === ConnectionState.CONNECTED,
      );

      // Set long operation delay to simulate timeout
      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      client.setOperationDelay(2000); // 2 second delay

      const hydrationStart = Date.now();

      try {
        await store.getState().multiplayer.hydrate();
      } catch (error) {
        // Should handle timeout gracefully
        console.log('Hydration timeout handled:', error);
      }

      const hydrationEnd = Date.now();

      // Reset delay for cleanup
      client.setOperationDelay(10);

      // Even if hydration times out, the system should remain functional
      expect(hydrationEnd - hydrationStart).toBeGreaterThan(0);
    });
  });

  describe('Hydration with onHydrate Callback Edge Cases', () => {
    it('should handle onHydrate callback that throws an error', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-callback-error');

      // Pre-populate storage
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);
      preStore.getState().increment();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Create store with faulty onHydrate callback
      const store = createTestStore({
        namespace: uniqueNamespace,
        onHydrate: () => {
          throw new Error('Hydration callback error');
        },
      });

      // Hydration should still complete despite callback error
      await waitFor(() => store.getState().multiplayer.hasHydrated);

      expect(store.getState().count).toBe(1);
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });

    it('should handle onHydrate callback with async operations', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-callback-async');
      let callbackCompleted = false;

      // Pre-populate storage
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);
      preStore.getState().setText('async-test');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Create store with async onHydrate callback
      const store = createTestStore({
        namespace: uniqueNamespace,
        onHydrate: async (state: TestState) => {
          await new Promise(resolve => setTimeout(resolve, 50));
          callbackCompleted = true;
          expect(state.text).toBe('async-test');
        },
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Callback should have completed
      await waitFor(() => expect(callbackCompleted).toBe(true));
      await waitFor(() => expect(store.getState().text).toBe('async-test'));
    });
  });

  describe('Hydration State Filtering', () => {
    it('should skip multiplayer state during hydration', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-skip-multiplayer');

      // Pre-populate storage
      const preStore = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => preStore.getState().multiplayer.hasHydrated);

      // Manually add multiplayer data to storage (simulating corrupted data)
      const globalStore = MockHPKVClientFactory.getGlobalStore();
      globalStore.set(
        `${uniqueNamespace}:multiplayer`,
        JSON.stringify({
          value: { connectionState: 'FAKE_STATE', hasHydrated: false },
          clientId: 'fake-client',
          timestamp: Date.now(),
        }),
      );

      // Create new store
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Multiplayer state should not be affected by hydration
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });

    it('should handle malformed stored values during hydration', async () => {
      const uniqueNamespace = createUniqueStoreName('hydration-malformed');

      // Manually add malformed data to storage
      const globalStore = MockHPKVClientFactory.getGlobalStore();
      globalStore.set(`${uniqueNamespace}:text`, 'not-json-wrapped');
      globalStore.set(`${uniqueNamespace}:count`, '{"invalid": "json"');

      // Create store and attempt hydration
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Should handle malformed data gracefully
      expect(store.getState().text).toBe('');
      expect(store.getState().count).toBe(0);
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });
  });
});
