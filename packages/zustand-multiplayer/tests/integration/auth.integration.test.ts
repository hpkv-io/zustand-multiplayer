import { ConnectionState } from '@hpkv/websocket-client';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
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
  waitForMultipleStores,
  StoreCreator,
  createTestServer,
  waitForHydration,
} from '../utils';

describe('Authentication & Security Tests', { concurrent: false }, () => {
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

  describe('API Key Authentication', () => {
    it('should authenticate successfully with valid API key', async () => {
      const store = storeCreator.createStore<TestState>(initializer, {
        namespace: createUniqueStoreName('valid-api-key'),
        apiBaseUrl: process.env.HPKV_API_BASE_URL!,
        apiKey: process.env.HPKV_API_KEY,
      });

      await waitForHydration(store);
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });

    it('should fail with empty API key', () => {
      expect(() => {
        storeCreator.createStore<TestState>(initializer, {
          namespace: createUniqueStoreName('empty-api-key'),
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: '',
        });
      }).toThrow('Either apiKey or tokenGenerationUrl must be provided');
    });

    it('should fail with null API key when no token URL provided', () => {
      expect(() => {
        storeCreator.createStore<TestState>(initializer, {
          namespace: createUniqueStoreName('null-api-key'),
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: undefined,
        });
      }).toThrow('Either apiKey or tokenGenerationUrl must be provided');
    });
  });

  describe('Token Authentication', () => {
    let testServerInfo: { server: any; serverUrl: string };

    beforeAll(async () => {
      testServerInfo = await createTestServer(
        process.env.HPKV_API_KEY ?? '',
        process.env.HPKV_API_BASE_URL ?? '',
      );
    });

    afterAll(() => {
      if (testServerInfo?.server) {
        testServerInfo.server.close();
      }
    });

    it('should authenticate with token generation URL', async () => {
      const store = storeCreator.createStore<TestState>(initializer, {
        namespace: createUniqueStoreName('token-auth'),
        apiBaseUrl: process.env.HPKV_API_BASE_URL,
        tokenGenerationUrl: testServerInfo.serverUrl,
        apiKey: undefined,
      });

      await waitForConnection(store);
      expect(store.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
    });
  });

  describe('Namespace Security', () => {
    it('should isolate data between different namespaces', async () => {
      const namespace1 = createUniqueStoreName('secure-namespace-1');
      const namespace2 = createUniqueStoreName('secure-namespace-2');

      const store1 = createTestStore({ namespace: namespace1 });
      const store2 = createTestStore({ namespace: namespace2 });
      const store3 = createTestStore({ namespace: namespace1 });

      await waitForMultipleStores([store1, store2, store3], 'hydrated');

      store1.getState().setTitle('Sensitive Data 1');
      store1.getState().addTodo('Secret Todo 1');

      store2.getState().setTitle('Sensitive Data 2');
      store2.getState().addTodo('Secret Todo 2');

      await waitFor(() => {
        expect(store3.getState().title).toBe('Sensitive Data 1');
        expect(store3.getState().todos['Secret Todo 1']).toBeDefined();
        expect(store3.getState().todos['Secret Todo 2']).toBeUndefined();

        expect(store2.getState().title).toBe('Sensitive Data 2');
        expect(store2.getState().todos['Secret Todo 2']).toBeDefined();
        expect(store2.getState().todos['Secret Todo 1']).toBeUndefined();
      });
    });

    it('should prevent namespace collision attacks', () => {
      const maliciousNamespaces = [
        'namespace/../../../etc/passwd',
        'namespace\\..\\..\\windows\\system32',
        'namespace\x00injection',
        'namespace<script>alert("xss")</script>',
      ];

      maliciousNamespaces.forEach(ns => {
        expect(() => {
          createTestStore({ namespace: ns });
        }).toThrow();
      });
    });
  });

  describe('Configuration Security', () => {
    it('should validate configuration parameters securely', () => {
      expect(() => {
        createTestStore({
          namespace: 'test',
          apiBaseUrl: 'javascript:alert("xss")',
          apiKey: process.env.HPKV_API_KEY,
        });
      }).toThrow();

      expect(() => {
        createTestStore({
          namespace: 'test',
          apiBaseUrl: 'data:text/html,<script>alert("xss")</script>',
          apiKey: process.env.HPKV_API_KEY,
        });
      }).toThrow();
    });
  });

  describe('Rate Limiting Security', () => {
    it('should enforce rate limits', async () => {
      const namespace = createUniqueStoreName('rate-limit-security');
      const store1 = createTestStore({
        namespace,
        rateLimit: 2,
      });
      const store2 = createTestStore({ namespace });

      await waitForMultipleStores([store1, store2], 'hydrated');

      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        store1.getState().increment();
      }

      await waitFor(
        () => {
          expect(store2.getState().counter).toBe(10);
        },
        { timeout: 5500 },
      );

      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(4000);
    });
  });
});
