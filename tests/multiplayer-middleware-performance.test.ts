import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { MultiplayerOptions } from '../src/multiplayer';
import { createUniqueStoreName, waitFor, waitForMetrics } from './utils/test-utils';
import { StateCreator } from 'zustand';
import { MockHPKVClientFactory } from './mocks/mock-hpkv-client';
import { MockWebsocketTokenManager } from './mocks/mock-token-manager';
import { MockTokenHelper } from './mocks/mock-token-manager';

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

// Test state for performance monitoring
type TestState = {
  count: number;
  text: string;
  data: Record<string, any>;
  increment: () => void;
  setText: (text: string) => void;
  setData: (key: string, value: any) => void;
  batchUpdate: () => void;
};

const initializer: StateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
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
    apiKey: 'test-api-key',
    apiBaseUrl: 'hpkv-base-api-url',
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

    // Perform multiple operations
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

    const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
    client.setOperationDelay(operationDelay);

    // Perform multiple sync operations
    store.getState().increment();
    store.getState().setText('Test sync timing');
    store.getState().setData('syncKey', 'syncValue');

    await waitFor(() => {
      const metrics = store.getState().multiplayer.getMetrics();
      return metrics.averageSyncTime > 0;
    });

    const metrics = store.getState().multiplayer.getMetrics();
    expect(metrics.averageSyncTime).toBeGreaterThan(operationDelay);
    expect(metrics.averageSyncTime).toBeLessThan(operationDelay * 2);
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

  it('should handle batch operations efficiently', async () => {
    const uniqueNamespace = createUniqueStoreName('performance-batch');
    const store = createTestStore({ namespace: uniqueNamespace });

    const initialMetrics = store.getState().multiplayer.getMetrics();

    // Perform batch operations
    const batchSize = 10;
    for (let i = 0; i < batchSize; i++) {
      store.getState().batchUpdate();
    }

    await waitForMetrics(() => store.getState().multiplayer.getMetrics(), {
      stateChangesProcessed: initialMetrics.stateChangesProcessed + batchSize,
    });

    const finalMetrics = store.getState().multiplayer.getMetrics();
    expect(finalMetrics.stateChangesProcessed).toBeGreaterThan(
      initialMetrics.stateChangesProcessed,
    );
  });
});
