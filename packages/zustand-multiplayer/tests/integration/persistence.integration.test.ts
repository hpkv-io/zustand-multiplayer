import type { HPKVApiClient } from '@hpkv/websocket-client';
import { HPKVClientFactory } from '@hpkv/websocket-client';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type {
  MultiplayerOptions,
  MultiplayerStoreApi,
  WithMultiplayer,
} from '../../src/types/multiplayer-types';
import type { TestState } from '../fixtures/store-fixtures';
import { createTestStateInitializer } from '../fixtures/store-fixtures';
import {
  createUniqueStoreName,
  waitFor,
  waitForHydration,
  getTestMultiplayerOptions,
  testZFactorPersistenceKeys,
  waitForMultipleStores,
} from '../utils';
import { StoreCreator } from '../utils/store-creator';

describe('Multiplayer Persistence Tests', { concurrent: false }, () => {
  let helperClient: HPKVApiClient;
  const storeCreator = new StoreCreator();
  const initializer = createTestStateInitializer();

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
    options?: Partial<MultiplayerOptions<TestState>>,
  ): MultiplayerStoreApi<WithMultiplayer<TestState>> {
    return storeCreator.createStore<TestState>(initializer, getTestMultiplayerOptions(options));
  }

  describe('Basic Persistence', () => {
    it('should not persist function properties', async () => {
      const uniqueNamespace = createUniqueStoreName('no-function-sync-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitForHydration(store);
      store.getState().increment();
      store.getState().setTitle('Synced Text');
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(helperClient.get(`${uniqueNamespace}-2:counter`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:increment`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:decrement`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:setTitle`)).rejects.toThrow(
        'Record not found',
      );
    });

    it('should remove the keys when clearStorage is called', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-clear-storage-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().increment();
      store1.getState().setTitle('Will be cleared');

      await waitFor(async () => {
        const count = await helperClient.get(`${uniqueNamespace}-2:counter`);
        const text = await helperClient.get(`${uniqueNamespace}-2:title`);
        expect(count.code).toBe(200);
        expect(text.code).toBe(200);
      });

      await store1.multiplayer.clearStorage();

      await expect(helperClient.get(`${uniqueNamespace}-2:counter`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:title`)).rejects.toThrow(
        'Record not found',
      );
    });
  });

  describe('Persistence Edge Cases', () => {
    it('should handle persistence with special characters in keys', async () => {
      const uniqueNamespace = createUniqueStoreName('special-chars-persistence');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitForMultipleStores([store1, store2], 'hydrated');

      // Add todos with special characters
      const specialTodos = [
        'todo-with-dashes',
        'todo_with_underscores',
        'todo.with.dots',
        'todo with spaces',
        'todo@with@symbols',
        'todo#hash',
        'todo$dollar',
        'todo%percent',
        'todo&ampersand',
        'todo+plus',
        'todo=equals',
      ];

      specialTodos.forEach(todo => {
        store1.getState().addTodo(todo);
      });

      await waitFor(() => {
        const todos = Object.keys(store2.getState().todos);
        return todos.length === specialTodos.length;
      });

      specialTodos.forEach(todo => {
        expect(store2.getState().todos[todo]).toBeDefined();
      });

      const store3 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => store3.getState().multiplayer.hasHydrated);

      specialTodos.forEach(todo => {
        expect(store3.getState().todos[todo]).toBeDefined();
      });
    });

    it('should handle persistence with unicode characters', async () => {
      const uniqueNamespace = createUniqueStoreName('unicode-persistence');
      const store1 = createTestStore({ namespace: uniqueNamespace });

      await waitForHydration(store1);

      // Unicode titles and todos
      const unicodeTitles = [
        '🎉 Celebration',
        '测试中文',
        'Tëst Äcçénts',
        '🚀 Rocket',
        'العربية',
        '日本語テスト',
        '🌟⭐✨',
      ];

      unicodeTitles.forEach(title => {
        store1.getState().setTitle(title);
        store1.getState().addTodo(title);
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Test persistence
      const store2 = createTestStore({ namespace: uniqueNamespace });
      await waitForHydration(store2);

      await waitFor(() => {
        const todos = Object.keys(store2.getState().todos);
        return todos.length === unicodeTitles.length;
      });

      unicodeTitles.forEach(title => {
        expect(store2.getState().todos[title]).toBeDefined();
      });
    });

    it('should handle very long key and value persistence', async () => {
      const uniqueNamespace = createUniqueStoreName('long-values-persistence');
      const store1 = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });

      await waitForHydration(store1);

      // Create very long strings
      const longKey = `very-long-todo-key-${'x'.repeat(150)}`;
      const longTitle = `Very long title: ${'Lorem ipsum dolor sit amet, '.repeat(100)}`;

      store1.getState().addTodo(longKey);
      store1.getState().setTitle(longTitle);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test persistence with new store
      const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });
      await waitForHydration(store2);

      await waitFor(() => {
        return (
          store2.getState().todos[longKey] !== undefined && store2.getState().title === longTitle
        );
      });

      expect(store2.getState().todos[longKey]).toBeDefined();
      expect(store2.getState().title).toBe(longTitle);
    });

    it('should handle atomic operations consistency', async () => {
      const uniqueNamespace = createUniqueStoreName('atomic-consistency');
      const store1 = createTestStore({ namespace: uniqueNamespace, zFactor: 2 });
      const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 2 });

      await waitForMultipleStores([store1, store2], 'hydrated');

      // Perform related operations that should be atomic
      const batchOperations = () => {
        store1.getState().increment();
        store1.getState().setTitle(`Counter at ${store1.getState().counter}`);
        store1.getState().addTodo(`Todo created at count ${store1.getState().counter}`);
      };

      // Perform batch operations multiple times
      for (let i = 0; i < 5; i++) {
        batchOperations();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait for synchronization
      await waitFor(() => {
        const state = store2.getState();
        return (
          state.counter === 5 &&
          state.title === 'Counter at 5' &&
          Object.keys(state.todos).length === 5
        );
      });

      // Verify consistency
      expect(store2.getState().counter).toBe(5);
      expect(store2.getState().title).toBe('Counter at 5');
      expect(Object.keys(store2.getState().todos).length).toBe(5);
    });

    it('should handle large batch operations persistence', async () => {
      const uniqueNamespace = createUniqueStoreName('large-batch-persistence');
      const store1 = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });

      await waitForHydration(store1);

      const batchSize = 30;
      const startTime = Date.now();

      // Large batch of operations
      for (let i = 0; i < batchSize; i++) {
        store1.getState().addTodo(`Batch Todo ${i}`);
        store1.getState().increment();

        // Occasional title updates
        if (i % 10 === 0) {
          store1.getState().setTitle(`Batch progress: ${i}/${batchSize}`);
        }
      }

      const operationTime = Date.now() - startTime;
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for persistence

      // Create new store to test persistence
      const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });
      await waitForHydration(store2);

      await waitFor(
        () => {
          const state = store2.getState();
          return state.counter === batchSize && Object.keys(state.todos).length === batchSize;
        },
        { timeout: 10000 },
      );

      expect(store2.getState().counter).toBe(batchSize);
      expect(Object.keys(store2.getState().todos).length).toBe(batchSize);
      expect(store2.getState().title).toBe('Batch progress: 20/30');

      // Performance check - should handle large batches efficiently
      expect(operationTime).toBeLessThan(5000);
    });
  });

  describe('zFactor Persistence Tests', { concurrent: false }, () => {
    it('should handle zFactor 0 storage correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('z-factor-0-test');

      const result = await testZFactorPersistenceKeys(
        helperClient,
        uniqueNamespace,
        0,
        async (namespace, zFactor) => {
          const store = createTestStore({ namespace, zFactor });
          await waitForHydration(store);
          store.getState().increment();
          store.getState().setTitle('title');
          store.getState().updateNested(25);
          store.getState().updateNested2(25);
          store.getState().updateNested3(25);
          store.getState().updateNested4(25);
          store.getState().addTodo('Test');
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        {
          shouldExist: ['counter', 'title', 'nested', 'todos'],
          shouldNotExist: [
            'todos:Test',
            'todos:Test:id',
            'todos:Test:title',
            'todos:Test:completed',
            'nested:value',
            'nested:nested2',
            'nested:nested2:value',
            'nested:nested2:nested3',
            'nested:nested2:nested3:value',
            'nested:nested2:nested3:nested4',
            'nested:nested2:nested3:nested4:value',
          ],
        },
      );

      expect(result).toBeTruthy();
    });

    it('should handle zFactor 1 storage correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('z-factor-1-test');
      const result = await testZFactorPersistenceKeys(
        helperClient,
        uniqueNamespace,
        1,
        async (namespace, zFactor) => {
          const store = createTestStore({ namespace, zFactor });
          await waitForHydration(store);
          store.getState().increment();
          store.getState().setTitle('title');
          store.getState().updateNested(25);
          store.getState().updateNested2(25);
          store.getState().updateNested3(25);
          store.getState().updateNested4(25);
          store.getState().addTodo('Test');
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        {
          shouldExist: ['counter', 'title', 'nested:value', 'nested:nested2', 'todos:Test'],
          shouldNotExist: [
            'todos',
            'todos:Test:id',
            'todos:Test:title',
            'todos:Test:completed',
            'nested',
            'nested:nested2:value',
            'nested:nested2:nested3',
            'nested:nested2:nested3:value',
            'nested:nested2:nested3:nested4',
            'nested:nested2:nested3:nested4:value',
          ],
        },
      );

      expect(result).toBeTruthy();
    });

    it('should handle zFactor 2 correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('z-factor-2-test');

      const result = await testZFactorPersistenceKeys(
        helperClient,
        uniqueNamespace,
        2,
        async (namespace, zFactor) => {
          const store = createTestStore({ namespace, zFactor });
          await waitForHydration(store);
          store.getState().increment();
          store.getState().setTitle('title');
          store.getState().updateNested(25);
          store.getState().updateNested2(25);
          store.getState().updateNested3(25);
          store.getState().updateNested4(25);
          store.getState().addTodo('Test');
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        {
          shouldExist: [
            'counter',
            'title',
            'nested:value',
            'nested:nested2:value',
            'nested:nested2:nested3',
            'todos:Test:id',
            'todos:Test:title',
            'todos:Test:completed',
          ],
          shouldNotExist: [
            'todos',
            'todos:Test',
            'nested',
            'nested:nested2',
            'nested:nested2:nested3:value',
            'nested:nested2:nested3:nested4',
            'nested:nested2:nested3:nested4:value',
          ],
        },
      );
      expect(result).toBeTruthy();
    });

    it('should handle zFactor 3 correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('z-factor-3-test');
      const result = await testZFactorPersistenceKeys(
        helperClient,
        uniqueNamespace,
        3,
        async (namespace, zFactor) => {
          const store = createTestStore({ namespace, zFactor });
          await waitForHydration(store);
          store.getState().increment();
          store.getState().setTitle('title');
          store.getState().updateNested(25);
          store.getState().updateNested2(25);
          store.getState().updateNested3(25);
          store.getState().updateNested4(25);
          store.getState().addTodo('Test');
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        {
          shouldExist: [
            'counter',
            'title',
            'nested:value',
            'nested:nested2:value',
            'nested:nested2:nested3:value',
            'nested:nested2:nested3:nested4',
            'todos:Test:id',
            'todos:Test:title',
            'todos:Test:completed',
          ],
          shouldNotExist: [
            'todos',
            'todos:Test',
            'nested',
            'nested:nested2',
            'nested:nested2:nested3',
            'nested:nested2:nested3:nested4:value',
          ],
        },
      );

      expect(result).toBeTruthy();
    });

    it('should handle zFactor 4 correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('z-factor-4-test');
      const result = await testZFactorPersistenceKeys(
        helperClient,
        uniqueNamespace,
        4,
        async (namespace, zFactor) => {
          const store = createTestStore({ namespace, zFactor });
          await waitForHydration(store);
          store.getState().increment();
          store.getState().setTitle('title');
          store.getState().updateNested(25);
          store.getState().updateNested2(25);
          store.getState().updateNested3(25);
          store.getState().updateNested4(25);
          store.getState().addTodo('Test');
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        {
          shouldExist: [
            'counter',
            'title',
            'nested:value',
            'nested:nested2:value',
            'nested:nested2:nested3:value',
            'nested:nested2:nested3:nested4:value',
            'todos:Test:id',
            'todos:Test:title',
            'todos:Test:completed',
          ],
          shouldNotExist: [
            'todos',
            'todos:Test',
            'nested',
            'nested:nested2',
            'nested:nested2:nested3',
            'nested:nested2:nested3:nested4',
          ],
        },
      );

      expect(result).toBeTruthy();
    });
  });
});
