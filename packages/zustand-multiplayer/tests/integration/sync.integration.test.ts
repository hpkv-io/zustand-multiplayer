import { describe, it, expect, afterAll } from 'vitest';
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
  getTestMultiplayerOptions,
  runZFactorTests,
  waitForMultipleStores,
  TEST_TIMEOUT,
} from '../utils';
import { StoreCreator } from '../utils/store-creator';

describe('Multiplayer Middleware Sync Tests', { concurrent: false }, () => {
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

  describe('Selective sync tests', { concurrent: false }, () => {
    runZFactorTests({
      testName: 'should only sync state between clients based on the configured sync options',
      testScenario: async zFactor => {
        const namespace = createUniqueStoreName(`sync-configuration-test`);
        const stores = [
          createTestStore({ namespace, zFactor, sync: ['title', 'todos', 'counter'] }),
          createTestStore({ namespace, zFactor, sync: ['title', 'todos', 'counter'] }),
          createTestStore({ namespace, zFactor, sync: ['title', 'todos'] }),
          createTestStore({ namespace, zFactor }),
        ];
        await waitForMultipleStores(stores, 'hydrated');

        stores[0].getState().increment();
        stores[0].getState().setTitle('set by store1');
        stores[0].getState().addTodo('Todo');

        await waitFor(() => {
          expect(stores[1].getState().title).toBe(stores[0].getState().title);
          expect(stores[2].getState().title).toBe(stores[0].getState().title);
          expect(stores[3].getState().title).toBe(stores[0].getState().title);
          expect(stores[1].getState().todos['Todo'].title).toBe(
            stores[0].getState().todos['Todo'].title,
          );
          expect(stores[2].getState().todos['Todo'].title).toBe(
            stores[0].getState().todos['Todo'].title,
          );
          expect(stores[3].getState().todos['Todo'].title).toBe(
            stores[0].getState().todos['Todo'].title,
          );
          expect(stores[1].getState().counter).toBe(stores[0].getState().counter);
          expect(stores[2].getState().counter).not.equals(stores[0].getState().counter);
          expect(stores[3].getState().counter).toBe(stores[0].getState().counter);
        });
      },
    });
  });

  describe('Nested state sync tests', { concurrent: false }, () => {
    runZFactorTests({
      testName: 'should sync nested state between clients',
      testScenario: async zFactor => {
        const namespace = createUniqueStoreName(`sync-nested-test`);
        const stores = [
          createTestStore({ namespace, zFactor, rateLimit: zFactor < 2 ? 5 : 20 }),
          createTestStore({ namespace, zFactor, rateLimit: zFactor < 2 ? 5 : 20 }),
        ];
        await waitForMultipleStores(stores, 'hydrated');

        stores[0].getState().updateNested(42);
        stores[0].getState().updateNested2(42);
        stores[0].getState().updateNested3(42);
        stores[0].getState().updateNested4(42);

        await waitFor(() => expect(stores[1].getState().nested.value).toBe(42));
        await waitFor(() => expect(stores[1].getState().nested.nested2.value).toBe(42));
        await waitFor(() => expect(stores[1].getState().nested.nested2.nested3.value).toBe(42));
        await waitFor(() =>
          expect(stores[1].getState().nested.nested2.nested3.nested4.value).toBe(42),
        );
      },
    });
  });

  describe('Record state sync tests', { concurrent: false }, () => {
    runZFactorTests({
      testName: 'should sync record state change between clients',
      testScenario: async zFactor => {
        const namespace = createUniqueStoreName(`sync-record-test`);
        const stores = [
          createTestStore({ namespace, zFactor }),
          createTestStore({ namespace, zFactor }),
        ];
        await waitForMultipleStores(stores, 'hydrated');

        stores[0].getState().addTodo('todo1');
        stores[0].getState().addTodo('todo2');

        await waitFor(() => {
          expect(stores[1].getState().todos['todo1'].title).toBe('todo1');
          expect(stores[1].getState().todos['todo2'].title).toBe('todo2');
        });

        stores[1].getState().updateTodoTitle('todo1', 'updated');
        await waitFor(() => expect(stores[0].getState().todos['todo1'].title).toBe('updated'));

        stores[0].getState().removeTodo('todo1');

        await waitFor(() => {
          expect(stores[1].getState().todos['todo1']?.title).toBeUndefined();
          expect(stores[1].getState().todos['todo2'].title).toBe('todo2');
        });
      },
    });
  });

  describe('Advanced Sync Scenarios', { concurrent: false }, () => {
    it('should handle partial state updates with complex nested objects', async () => {
      const namespace = createUniqueStoreName('partial-complex-test');
      const store1 = createTestStore({ namespace, zFactor: 2 });
      const store2 = createTestStore({ namespace, zFactor: 2 });

      await waitForMultipleStores([store1, store2], 'hydrated');

      // Update deeply nested values independently
      store1.getState().updateNested(10);
      store1.getState().updateNested2(20);
      store1.getState().updateNested3(30);
      store1.getState().updateNested4(40);

      await waitFor(() => {
        const nested = store2.getState().nested;
        return (
          nested.value === 10 &&
          nested.nested2.value === 20 &&
          nested.nested2.nested3.value === 30 &&
          nested.nested2.nested3.nested4.value === 40
        );
      });

      // Update only one level, others should remain
      store2.getState().updateNested2(99);

      await waitFor(() => store1.getState().nested.nested2.value === 99);

      // Other nested values should be preserved
      expect(store1.getState().nested.value).toBe(10);
      expect(store1.getState().nested.nested2.nested3.value).toBe(30);
      expect(store1.getState().nested.nested2.nested3.nested4.value).toBe(40);
    });

    it('should handle sync with very large nested objects', async () => {
      interface LargeNestedState {
        data: Record<string, Record<string, any>>;
        addCategory: (category: string) => void;
        addItem: (category: string, key: string, value: any) => void;
      }

      const largeNestedInitializer = (set: any) => ({
        data: {},
        addCategory: (category: string) =>
          set((state: LargeNestedState) => ({
            data: { ...state.data, [category]: {} },
          })),
        addItem: (category: string, key: string, value: any) =>
          set((state: LargeNestedState) => ({
            data: {
              ...state.data,
              [category]: { ...state.data[category], [key]: value },
            },
          })),
      });

      const namespace = createUniqueStoreName('large-nested');
      const store1 = storeCreator.createStore<LargeNestedState>(largeNestedInitializer as any, {
        ...getTestMultiplayerOptions({ namespace }),
      });
      const store2 = storeCreator.createStore<LargeNestedState>(largeNestedInitializer as any, {
        ...getTestMultiplayerOptions({ namespace }),
      });

      await waitFor(() => store1.getState().multiplayer.hasHydrated);
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      const categories = ['cat1', 'cat2', 'cat3'];

      const completeData: Record<string, Record<string, any>> = {};
      categories.forEach(cat => {
        completeData[cat] = {};
        for (let i = 0; i < 10; i++) {
          completeData[cat][`item${i}`] = `value-${i}`;
        }
      });

      store1.setState({ data: completeData });

      await waitFor(
        () => {
          const data = store2.getState().data;
          const cat1Count = Object.keys(data.cat1 || {}).length;
          const cat2Count = Object.keys(data.cat2 || {}).length;
          const cat3Count = Object.keys(data.cat3 || {}).length;
          return (
            Object.keys(data).length === 3 &&
            cat1Count === 10 &&
            cat2Count === 10 &&
            cat3Count === 10
          );
        },
        { timeout: TEST_TIMEOUT.LONG * 6 },
      );

      categories.forEach(cat => {
        const categoryData = store2.getState().data[cat];
        expect(categoryData).toBeDefined();
        expect(Object.keys(categoryData).length).toBe(10);

        for (let i = 0; i < 10; i++) {
          expect(categoryData[`item${i}`]).toBe(`value-${i}`);
        }
      });
    });
  });
});
