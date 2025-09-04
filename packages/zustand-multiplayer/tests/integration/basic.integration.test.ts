import { fail } from 'assert';
import { ConnectionState } from '@hpkv/websocket-client';
import { describe, it, expect, afterAll } from 'vitest';
import type {
  MultiplayerOptions,
  MultiplayerStoreApi,
  WithMultiplayer,
} from '../../src/types/multiplayer-types';
import { type TestState, createTestStateInitializer } from '../fixtures/store-fixtures';
import {
  createUniqueStoreName,
  waitFor,
  getTestMultiplayerOptions,
  waitForConnection,
  waitForHydration,
  waitForDisconnection,
  waitForMultipleStores,
  StoreCreator,
} from '../utils';

describe('Basic Integration', { concurrent: false }, () => {
  const storeCreator = new StoreCreator();
  const initializer = createTestStateInitializer();

  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  function createTestStore(
    options?: Partial<MultiplayerOptions<TestState>>,
  ): MultiplayerStoreApi<WithMultiplayer<TestState>> {
    return storeCreator.createStore<TestState>(initializer, getTestMultiplayerOptions(options));
  }

  describe('Store Creation', () => {
    it('creates store with initial state', () => {
      const store = createTestStore();
      expect(store.getState().counter).toBe(0);
      expect(store.getState().title).toBe('');
    });

    it('has multiplayer state with required properties', () => {
      const store = createTestStore();
      const multiplayerState = store.getState().multiplayer;
      const multiplayerApi = store.multiplayer;

      expect(multiplayerState).toBeDefined();
      expect(typeof multiplayerState.connectionState).toBe('string');
      expect(typeof multiplayerState.hasHydrated).toBe('boolean');
      expect(typeof multiplayerState.performanceMetrics.averageSyncTime).toBe('number');
      expect(typeof multiplayerApi.disconnect).toBe('function');
      expect(typeof multiplayerApi.clearStorage).toBe('function');
      expect(typeof multiplayerApi.getMetrics).toBe('function');
      expect(typeof multiplayerApi.getConnectionStatus).toBe('function');
      expect(typeof multiplayerApi.connect).toBe('function');
      expect(typeof multiplayerApi.reHydrate).toBe('function');
      expect(typeof multiplayerApi.destroy).toBe('function');
    });

    it('automatically connects on creation', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-auto-connect-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() =>
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED),
      );
    });

    it('automatically hydrates on creation', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-auto-hydrate-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => expect(store.getState().multiplayer.hasHydrated).toBe(true));
    });
  });

  describe('Multiplayer State', () => {
    it('updates hydration state', async () => {
      const store = createTestStore();
      expect(store.getState().multiplayer.hasHydrated).toBe(false);
      await waitFor(() => expect(store.getState().multiplayer.hasHydrated).toBe(true));
    });

    it('updates connectionState state', async () => {
      const store = createTestStore();
      expect(store.getState().multiplayer.connectionState).toBe(
        ConnectionState.DISCONNECTED || ConnectionState.CONNECTING,
      );
      await waitFor(() =>
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED),
      );
    });

    it('updates performanceMetrics state', async () => {
      const store = createTestStore();
      expect(store.getState().multiplayer.performanceMetrics.averageSyncTime).toBe(0);
      await waitForHydration(store);
      store.getState().increment();
      await waitFor(() =>
        expect(store.getState().multiplayer.performanceMetrics.averageSyncTime).toBeGreaterThan(0),
      );
    });
  });

  describe('Multiplayer API Tests', () => {
    it('should connect when connect() is called', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-connect-test');
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitForHydration(store);
      await store.multiplayer.disconnect();
      await waitForDisconnection(store);
      await store.multiplayer.connect();

      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      });
    });

    it('should disconnect when disconnect() is called', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-disconnect-test');
      const store = createTestStore({ namespace: uniqueNamespace });
      await waitForHydration(store);
      await store.multiplayer.disconnect();

      await waitFor(() => {
        expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.DISCONNECTED);
      });
    });

    it('should gets the current connection status when getConnectionState() is called', async () => {
      const store = createTestStore();
      await waitForConnection(store);
      expect(store.multiplayer.getConnectionStatus()?.connectionState).toBe(
        store.getState().multiplayer.connectionState,
      );
    });

    it('should gets the current performance metrics when getMetrics() is called', async () => {
      const store = createTestStore();
      await waitForHydration(store);
      expect(store.multiplayer.getMetrics().averageSyncTime).toBe(
        store.getState().multiplayer.performanceMetrics.averageSyncTime,
      );
      store.getState().increment();
      expect(store.multiplayer.getMetrics().averageSyncTime).toBe(
        store.getState().multiplayer.performanceMetrics.averageSyncTime,
      );
    });

    it('should clear the store data when clearStorage() is called', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-clear-storage-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitForMultipleStores([store1, store2], 'hydrated');

      store1.getState().setTitle('Text');
      await waitFor(() => expect(store2.getState().title).toBe('Text'));

      await store1.multiplayer.clearStorage();
      await waitFor(() => expect(store2.getState().title).toBeNull());
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle extreme zFactor values correctly', () => {
      expect(() => {
        createTestStore({
          namespace: createUniqueStoreName('zfactor-min'),
          zFactor: -5,
        });
      }).toThrow();
      expect(() => {
        createTestStore({
          namespace: createUniqueStoreName('zfactor-min'),
          zFactor: 100,
        });
      }).toThrow();
    });

    it('should handle empty sync configurations', async () => {
      const namespace1 = createUniqueStoreName('empty-sync');
      const store1 = createTestStore({ namespace: namespace1, sync: [] });
      const store2 = createTestStore({ namespace: namespace1, sync: [] });

      await waitForMultipleStores([store1, store2], 'hydrated');

      store1.getState().increment();
      store1.getState().setTitle('Should not sync');

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(store2.getState().counter).toBe(0);
      expect(store2.getState().title).toBe('');
    });

    it('should handle namespace with special characters', () => {
      const specialNamespaces = [
        'test-namespace',
        'test_namespace',
        'test.namespace',
        'test@namespace',
        'test#namespace',
        'test$namespace',
        'test%namespace',
        'test&namespace',
        'test+namespace',
        'test=namespace',
      ];

      for (const namespace of specialNamespaces) {
        try {
          createTestStore({
            namespace: createUniqueStoreName(namespace),
          });
          fail('Should throw');
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });

    it('should handle very long namespace strings', () => {
      const longNamespace = 'a'.repeat(1000);
      expect(() => {
        createTestStore({
          namespace: createUniqueStoreName(longNamespace),
        });
      }).toThrow();
    });

    it('should throw when malformed API URLs provided', () => {
      const malformedUrls = [
        'not-a-url',
        'http://',
        'https://',
        '://example.com',
        'http://[invalid]',
        'ftp://example.com',
      ];

      for (const url of malformedUrls) {
        expect(() => {
          storeCreator.createStore<TestState>(initializer, {
            namespace: createUniqueStoreName('malformed-url'),
            apiBaseUrl: url,
            apiKey: 'test-key',
          });
        }).toThrow();
      }
    });

    it('should handle invalid sync field names', async () => {
      const store = createTestStore({
        namespace: createUniqueStoreName('invalid-sync-fields'),
        sync: ['counter', 'nonExistentField', 'anotherInvalid'] as any,
      });

      await waitForHydration(store);

      // Should still work for valid fields
      store.getState().increment();
      expect(store.getState().counter).toBe(1);
    });
  });

  describe('Basic Sync & Persistence Tests', () => {
    it('should synchronize state changes between clients in the same namespace', async () => {
      const uniqueNamespace = createUniqueStoreName('sync-primitives-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitForMultipleStores([store1, store2], 'hydrated');

      store1.getState().increment();
      store2.getState().setTitle('Synced Text');

      await waitFor(() => {
        expect(store1.getState().title).toBe('Synced Text');
        expect(store2.getState().counter).toBe(1);
      });
    });

    it('should not synchronize state changes between clients in different namespaces', async () => {
      const uniqueNamespace1 = createUniqueStoreName('sync-integration-test-1');
      const uniqueNamespace2 = createUniqueStoreName('sync-integration-test-2');
      const store1 = createTestStore({ namespace: uniqueNamespace1 });
      const store2 = createTestStore({ namespace: uniqueNamespace2 });
      const store3 = createTestStore({ namespace: uniqueNamespace1 });

      await waitForMultipleStores([store1, store2, store3], 'hydrated');

      store1.getState().increment();

      await waitFor(() => {
        expect(store1.getState().counter).toBe(1);
        expect(store2.getState().counter).toBe(0);
        expect(store3.getState().counter).toBe(1);
      });
    });

    it('should not synchronize state changes between clients in same namespaces but different zFactors', async () => {
      const uniqueNamespace = createUniqueStoreName('sync-integration-different-zFactor-test');

      const store1 = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });
      const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });
      const store3 = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });

      await waitForMultipleStores([store1, store2, store3], 'hydrated');

      store1.getState().increment();

      await waitFor(() => {
        expect(store2.getState().counter).toBe(0);
        expect(store1.getState().counter).toBe(1);
        expect(store3.getState().counter).toBe(1);
      });
    });

    it('should persist state changes', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-persistence-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      await waitForHydration(store1);

      store1.getState().increment();
      store1.getState().setTitle('Persistence Test');

      await new Promise(resolve => setTimeout(resolve, 100));

      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitForHydration(store2);

      await waitFor(() => {
        expect(store2.getState().counter).toBe(1);
        expect(store2.getState().title).toBe('Persistence Test');
      });
    });
  });
});
