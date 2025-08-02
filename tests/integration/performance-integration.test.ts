import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import type { StateCreator } from 'zustand';
import type { MultiplayerOptions } from '../../src/types/multiplayer-types';
import { createUniqueStoreName, waitFor, waitForMetrics } from '../utils/test-utils';
import { setupE2EMocks, importAfterMocks } from './setup';

setupE2EMocks();

const { StoreCreator } = await importAfterMocks();

interface TestState {
  count: number;
  text: string;
  data: Record<string, any>;
  increment: () => void;
  setText: (text: string) => void;
  setData: (key: string, value: any) => void;
  batchUpdate: () => void;
}

const initializer: StateCreator<TestState, [], []> = set => ({
  count: 0,
  text: '',
  data: {},
  increment: () => set(state => ({ count: state.count + 1 })),
  setText: (text: string) => set({ text }),
  setData: (key: string, value: any) =>
    set(state => ({
      data: { ...state.data, [key]: value },
    })),
  batchUpdate: () =>
    set(state => ({
      count: state.count + 1,
      text: `Updated ${Date.now()}`,
      data: { ...state.data, timestamp: Date.now() },
    })),
});

const storeCreator = new StoreCreator();

function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, {
    ...options,
    profiling: true,
  });
}

describe('Multiplayer Middleware Performance Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should track basic performance metrics', async () => {
    const uniqueNamespace = createUniqueStoreName('performance-basic');
    const store = createTestStore({ namespace: uniqueNamespace });

    store.getState().increment();
    store.getState().setText('Performance test');
    store.getState().setData('key1', 'value1');
    store.getState().setData('key2', 'value2');

    await waitFor(() => {
      const metrics = store.getState().multiplayer.getMetrics();
      return metrics.stateChangesProcessed > 0;
    });

    const metrics = store.getState().multiplayer.getMetrics();

    expect(metrics.stateChangesProcessed).toBeGreaterThan(0);
    expect(metrics.averageHydrationTime).toBeGreaterThanOrEqual(0);
  });

  it('should track state changes processed correctly', async () => {
    const uniqueNamespace = createUniqueStoreName('performance-changes');
    const store = createTestStore({ namespace: uniqueNamespace });

    const initialMetrics = store.getState().multiplayer.getMetrics();
    const initialChanges = initialMetrics.stateChangesProcessed;

    const numberOfOperations = 5;
    for (let i = 0; i < numberOfOperations; i++) {
      store.getState().increment();
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    await waitForMetrics(() => store.getState().multiplayer.getMetrics(), {
      stateChangesProcessed: initialChanges + numberOfOperations,
    });

    const finalMetrics = store.getState().multiplayer.getMetrics();
    expect(finalMetrics.stateChangesProcessed).toBe(initialChanges + numberOfOperations);
  });

  it('should measure hydration time', async () => {
    const uniqueNamespace = createUniqueStoreName('performance-hydration');

    const store1 = createTestStore({ namespace: uniqueNamespace });
    await waitFor(() => store1.getState().multiplayer.hasHydrated);

    store1.getState().setText('Initial data');
    store1.getState().setData('key', 'value');

    await new Promise(resolve => setTimeout(resolve, 100));

    const store2 = createTestStore({ namespace: uniqueNamespace });
    await waitFor(() => store2.getState().multiplayer.hasHydrated);

    const metrics = store2.getState().multiplayer.getMetrics();
    expect(metrics.averageHydrationTime).toBeGreaterThan(0);
  });

  it('should measure sync time for state changes', async () => {
    const operationDelay = 15;
    const uniqueNamespace = createUniqueStoreName('performance-sync');
    const store = createTestStore({ namespace: uniqueNamespace });
    await waitFor(() => store.getState().multiplayer.hasHydrated);

    store.getState().increment();
    store.getState().setText('Test sync timing');
    store.getState().setData('syncKey', 'syncValue');

    await waitFor(() => {
      const metrics = store.getState().multiplayer.getMetrics();
      expect(metrics.averageSyncTime).toBeGreaterThanOrEqual(0.8 * operationDelay);
      expect(metrics.averageSyncTime).toBeLessThanOrEqual(operationDelay * 3);
    });
  });

  it('should track sync time across multiple operations', async () => {
    const uniqueNamespace = createUniqueStoreName('performance-sync-multiple');
    const store = createTestStore({ namespace: uniqueNamespace });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    const numberOfSyncOperations = 5;
    const syncPromises: Promise<void>[] = [];

    for (let i = 0; i < numberOfSyncOperations; i++) {
      store.getState().setData(`key${i}`, `value${i}`);
      syncPromises.push(new Promise(resolve => setTimeout(resolve, 10)));
    }

    await Promise.all(syncPromises);

    await waitFor(() => {
      const metrics = store.getState().multiplayer.getMetrics();
      return metrics.averageSyncTime > 0 && metrics.stateChangesProcessed >= numberOfSyncOperations;
    });

    const metrics = store.getState().multiplayer.getMetrics();
    expect(metrics.averageSyncTime).toBeGreaterThan(0);
    expect(metrics.stateChangesProcessed).toBeGreaterThanOrEqual(numberOfSyncOperations);
  });
});
