import { describe, it, expect, afterAll } from 'vitest';
import { create } from 'zustand';
import { multiplayer } from '../../src/multiplayer';
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
  waitForHydration,
  waitForMultipleStores,
  StoreCreator,
  TEST_TIMEOUT,
} from '../utils';

describe('Performance & Optimization Tests', { concurrent: false }, () => {
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

  describe('Performance Metrics', { concurrent: false }, () => {
    it('should track sync time accurately', async () => {
      const store = createTestStore({
        namespace: createUniqueStoreName('metrics-test'),
      });

      await waitForHydration(store);
      expect(store.getState().multiplayer.performanceMetrics.averageSyncTime).toBe(0);

      store.getState().increment();
      store.getState().setTitle('Test');

      await waitFor(() => store.getState().multiplayer.performanceMetrics.averageSyncTime > 0);

      const metrics = store.multiplayer.getMetrics();
      expect(metrics.averageSyncTime).toBeGreaterThan(0);
    });

    it('should calculate rolling average for sync times', async () => {
      const store = createTestStore({
        namespace: createUniqueStoreName('rolling-avg-test'),
      });

      await waitForHydration(store);

      const syncTimes: number[] = [];

      // Perform multiple operations and track metrics
      for (let i = 0; i < 5; i++) {
        store.getState().increment();
        await new Promise(resolve => setTimeout(resolve, 100));

        const currentMetric = store.getState().multiplayer.performanceMetrics.averageSyncTime;
        if (currentMetric > 0) {
          syncTimes.push(currentMetric);
        }
      }

      // Should have recorded multiple sync times
      expect(syncTimes.length).toBeGreaterThan(0);

      // Average should be reasonable
      const finalAverage = store.getState().multiplayer.performanceMetrics.averageSyncTime;
      expect(finalAverage).toBeGreaterThan(0);
      expect(finalAverage).toBeLessThan(2000);
    });
  });

  describe('High-Frequency Updates', { concurrent: false }, () => {
    it('should handle burst of updates efficiently', async () => {
      const namespace = createUniqueStoreName('burst-test');
      const store1 = createTestStore({ namespace, rateLimit: 20 });
      const store2 = createTestStore({ namespace, rateLimit: 20 });

      await waitForMultipleStores([store1, store2], 'hydrated');

      const startTime = Date.now();
      const updateCount = 50;

      for (let i = 0; i < updateCount; i++) {
        store1.getState().increment();
      }

      await waitFor(() => store2.getState().counter === updateCount, {
        timeout: TEST_TIMEOUT.LONG,
      });

      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(2000);
      expect(duration).toBeLessThan(5000);
      expect(store2.getState().counter).toBe(updateCount);
    });

    it('should batch updates efficiently with high zFactor', async () => {
      const namespace = createUniqueStoreName('batch-zfactor-test');
      const store1 = createTestStore({ namespace, zFactor: 3, rateLimit: 20 });
      const store2 = createTestStore({ namespace, zFactor: 3, rateLimit: 20 });

      await waitForMultipleStores([store1, store2], 'hydrated');

      const startTime = Date.now();

      store1.getState().updateNested(10);
      store1.getState().updateNested2(20);
      store1.getState().updateNested3(30);
      store1.getState().updateNested4(40);

      await waitFor(() => {
        const state = store2.getState();
        return (
          state.nested.value === 10 &&
          state.nested.nested2.value === 20 &&
          state.nested.nested2.nested3.value === 30 &&
          state.nested.nested2.nested3.nested4.value === 40
        );
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
    });

    it('should maintain performance with multiple concurrent clients', async () => {
      const namespace = createUniqueStoreName('concurrent-perf-test');
      const stores = Array.from({ length: 5 }, () => createTestStore({ namespace, rateLimit: 20 }));

      await waitForMultipleStores(stores, 'hydrated');

      const startTime = Date.now();

      // Each store performs updates concurrently
      const updatePromises = stores.map(async (store, index) => {
        for (let i = 0; i < 10; i++) {
          store.getState().addTodo(`Store${index}-Todo${i}`);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      });

      await Promise.all(updatePromises);

      // Wait for all updates to propagate
      await waitFor(() => {
        const todoCount = Object.keys(stores[0].getState().todos).length;
        return todoCount === 50; // 5 stores * 10 todos each
      });

      const duration = Date.now() - startTime;

      // Should handle concurrent updates efficiently
      expect(duration).toBeGreaterThan(1000);
      expect(duration).toBeLessThan(3000);

      // Verify all stores have same state
      const finalTodoCount = Object.keys(stores[0].getState().todos).length;
      await waitFor(() => {
        stores.forEach(store => {
          expect(Object.keys(store.getState().todos).length).toBe(finalTodoCount);
        });
      });
    });
  });

  describe('Memory Management', { concurrent: false }, () => {
    it('should handle large state objects', async () => {
      interface LargeState {
        largeArray: number[];
        largeObject: Record<string, any>;
        updateArray: (arr: number[]) => void;
        updateObject: (key: string, value: any) => void;
      }

      const largeInitializer = (set: any) => ({
        largeArray: [],
        largeObject: {},
        updateArray: (arr: number[]) => set({ largeArray: arr }),
        updateObject: (key: string, value: any) =>
          set((state: LargeState) => ({
            largeObject: { ...state.largeObject, [key]: value },
          })),
      });

      const namespace = createUniqueStoreName('large-state-perf');
      const store1 = create<WithMultiplayer<LargeState>>()(
        multiplayer(largeInitializer as any, {
          namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
          zFactor: 3,
        }),
      );

      const store2 = create<WithMultiplayer<LargeState>>()(
        multiplayer(largeInitializer as any, {
          namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
          zFactor: 3,
        }),
      );

      await waitFor(() => store1.getState().multiplayer.hasHydrated);
      await waitFor(() => store2.getState().multiplayer.hasHydrated);

      // Create large array
      const largeArray = Array.from({ length: 500 }, (_, i) => i);
      store1.getState().updateArray(largeArray);

      // Create large object
      for (let i = 0; i < 100; i++) {
        store1.getState().updateObject(`key${i}`, { data: `value${i}`.repeat(100) });
      }

      // Should sync large state
      await waitFor(() => store2.getState().largeArray.length === 500, {
        timeout: TEST_TIMEOUT.LONG,
      });
      await waitFor(() => Object.keys(store2.getState().largeObject).length === 100);

      expect(store2.getState().largeArray.length).toBe(500);
      expect(Object.keys(store2.getState().largeObject).length).toBe(100);

      await store1.multiplayer.clearStorage();
      await store1.multiplayer.disconnect();
      await store1.multiplayer.destroy();
      await store2.multiplayer.disconnect();
      await store1.multiplayer.destroy();
    });
  });

  describe('Optimization Strategies', { concurrent: false }, () => {
    it('should optimize with different zFactor values', async () => {
      const testZFactorPerformance = async (zFactor: number) => {
        const namespace = createUniqueStoreName(`zfactor-perf-${zFactor}`);
        const store1 = createTestStore({ namespace, zFactor });
        const store2 = createTestStore({ namespace, zFactor });

        await waitForMultipleStores([store1, store2], 'hydrated');

        const startTime = Date.now();

        // Update nested structure
        store1.getState().updateNested(zFactor * 10);
        store1.getState().updateNested2(zFactor * 20);
        store1.getState().updateNested3(zFactor * 30);

        await waitFor(() => store2.getState().nested.nested2.nested3.value === zFactor * 30);

        return Date.now() - startTime;
      };

      // Test different zFactor values
      const results: Record<number, number> = {};
      for (const zFactor of [0, 1, 2, 3]) {
        results[zFactor] = await testZFactorPerformance(zFactor);
      }

      // All should complete within reasonable time
      Object.values(results).forEach(duration => {
        expect(duration).toBeLessThan(300);
      });
    });

    it('should optimize selective sync performance', async () => {
      const namespace = createUniqueStoreName('selective-sync-perf');

      // Store with full sync
      const fullSyncStore = createTestStore({ namespace });

      // Store with selective sync
      const selectiveSyncStore = createTestStore({
        namespace,
        sync: ['counter', 'title'], // Only sync specific fields
      });

      await waitForMultipleStores([fullSyncStore, selectiveSyncStore], 'hydrated');

      const startTime = Date.now();

      // Update various fields
      fullSyncStore.getState().increment();
      fullSyncStore.getState().setTitle('Test');
      fullSyncStore.getState().addTodo('Todo1');
      fullSyncStore.getState().updateNested(42);

      // Selective sync should only receive counter and title
      await waitFor(() => {
        const state = selectiveSyncStore.getState();
        return state.counter === 1 && state.title === 'Test';
      });

      const duration = Date.now() - startTime;

      // Should be efficient even with selective sync
      expect(duration).toBeLessThan(2000);

      // Verify selective sync worked correctly
      expect(selectiveSyncStore.getState().counter).toBe(1);
      expect(selectiveSyncStore.getState().title).toBe('Test');
      expect(Object.keys(selectiveSyncStore.getState().todos).length).toBe(0);
      expect(selectiveSyncStore.getState().nested.value).toBe(0);
    });
  });

  describe('Stress Testing', { concurrent: false }, () => {
    it('should handle rapid state changes under load', async () => {
      const namespace = createUniqueStoreName('stress-test');
      const stores = Array.from({ length: 3 }, () => createTestStore({ namespace, rateLimit: 20 }));

      await waitForMultipleStores(stores, 'hydrated');

      const operations = 10;
      const startTime = Date.now();

      // Stress test with mixed operations
      const stressPromises = stores.map(async (store, storeIndex) => {
        for (let i = 0; i < operations; i++) {
          const op = i % 4;
          switch (op) {
            case 0:
              store.getState().increment();
              break;
            case 1:
              store.getState().setTitle(`Stress-${storeIndex}-${i}`);
              break;
            case 2:
              store.getState().addTodo(`Todo-${storeIndex}-${i}`);
              break;
            case 3:
              store.getState().updateNested(i);
              break;
          }

          // Small delay to simulate realistic usage
          if (i % 2 === 0) {
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        }
      });

      await Promise.all(stressPromises);

      // Wait for stabilization
      await new Promise(resolve => setTimeout(resolve, 3500));

      const duration = Date.now() - startTime;

      // Should complete stress test within reasonable time
      expect(duration).toBeLessThan(15000);

      // All stores should eventually have same state
      const finalState = stores[0].getState();
      await waitFor(() => {
        stores.slice(1).forEach(store => {
          const state = store.getState();
          expect(state.counter).toBe(finalState.counter);
          expect(Object.keys(state.todos).length).toBe(Object.keys(finalState.todos).length);
        });
      });
    });

    it('should maintain performance with sustained load', async () => {
      const namespace = createUniqueStoreName('sustained-load');
      const store1 = createTestStore({ namespace, rateLimit: 20 });
      const store2 = createTestStore({ namespace, rateLimit: 20 });

      await waitForMultipleStores([store1, store2], 'hydrated');

      const duration = 5000; // 5 seconds sustained load
      const startTime = Date.now();
      let operationCount = 0;

      // Sustained load for fixed duration
      while (Date.now() - startTime < duration) {
        store1.getState().increment();
        operationCount++;

        // Vary the rate
        if (operationCount % 2 === 0) {
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      }

      // Wait for final sync
      await waitFor(() => store2.getState().counter === operationCount, {
        timeout: 40000,
      });

      // Calculate operations per second
      const opsPerSecond = operationCount / (duration / 1000);

      // Should maintain reasonable throughput
      expect(opsPerSecond).toBeGreaterThan(5);
      expect(store2.getState().counter).toBe(operationCount);
    });
  });
});
