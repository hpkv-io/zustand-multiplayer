import { describe, it, expect, vi, afterAll } from 'vitest';
import { multiplayer, MultiplayerOptions } from '../src/multiplayer';
import { createUniqueStoreName, waitFor } from './utils/test-utils';
import { MockHPKVStorage } from './mocks/mock-storage';
import { create, StateCreator } from 'zustand';
import { StoreCreator } from './utils/store-creator';
import { subscribeWithSelector } from 'zustand/middleware';

// Mock HPKV client
vi.mock('../src/hpkvStorage', () => {
  return {
    createHPKVStorage: vi
      .fn()
      .mockImplementation((options: Partial<MultiplayerOptions<TestState>>) => {
        return new MockHPKVStorage(options);
      }),
  };
});

// Define our test store shape
type TestState = {
  count: number;
  text: string;
  nested: {
    value: number;
  };
  increment: () => void;
  decrement: () => void;
  setText: (text: string) => void;
  updateNested: (value: number) => void;
};

const initializer: StateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0 },
  increment: () => set(state => ({ count: state.count + 1 })),
  decrement: () => set(state => ({ count: state.count - 1 })),
  setText: (text: string) => set({ text }),
  updateNested: (value: number) => set({ nested: { value } }),
});

const storeCreator = new StoreCreator();
function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, options);
}

describe('Multiplayer Middleware', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  it('should have the default state', () => {
    const store1 = createTestStore();
    expect(store1.getState().count).toBe(0);
    expect(store1.getState().text).toBe('');
    expect(store1.getState().nested.value).toBe(0);
  });

  it('should have multiplayer API methods', () => {
    const store1 = createTestStore();
    expect(store1.multiplayer).toBeDefined();
    expect(typeof store1.multiplayer.disconnect).toBe('function');
    expect(typeof store1.multiplayer.clearStorage).toBe('function');
  });

  it('should synchronize primitive state changes between instances', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });
    // Update state in first store
    store1.getState().increment();
    expect(store2.getState().count).toBe(1);

    // Update state in second store
    store2.getState().setText('Hello HPKV');
    expect(store1.getState().text).toBe('Hello HPKV');
  });

  it('should hydrate state from storage', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    // Update state in first store
    store1.getState().increment();
    store1.getState().setText('Hello HPKV');
    const newStore = createTestStore({ namespace: uniqueNamespace });
    await waitFor(() => {
      expect(newStore.getState().count).toBe(1);
      expect(newStore.getState().text).toBe('Hello HPKV');
    });
  });

  it('should isolate state between namespaces', async () => {
    const uniqueNamespace1 = createUniqueStoreName('namespace-1');
    const uniqueNamespace2 = createUniqueStoreName('namespace-2');
    const store1 = createTestStore({ namespace: uniqueNamespace1 });
    const store2 = createTestStore({ namespace: uniqueNamespace2 });

    store1.getState().increment();
    store2.getState().setText('Hello');

    expect(store1.getState().count).toBe(1);
    expect(store2.getState().count).toBe(0);
    expect(store1.getState().text).toBe('');
    expect(store2.getState().text).toBe('Hello');
  });

  it('should synchronize nested object changes', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });
    // Update nested state in first store
    store1.getState().updateNested(42);

    // Wait for synchronization
    await waitFor(
      () => {
        expect(store2.getState().nested.value).toBe(42);
      },
      { timeout: 1000 },
    );
  });

  it('should clear all data when calling clearStorage', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });
    // Make some changes
    store1.getState().increment();
    store1.getState().setText('Test');

    expect(store2.getState().count).toBe(1);
    expect(store2.getState().text).toBe('Test');

    // Clear storage
    await store1.multiplayer.clearStorage();

    // Create a new store to see if it gets the cleared data
    const store3 = createTestStore({ namespace: uniqueNamespace });

    expect(store3.getState().count).toBe(0);
    expect(store3.getState().text).toBe('');
  });

  it('should be possible to combine with other middlewares', () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store = create<TestState>()(
      subscribeWithSelector(
        multiplayer(initializer, {
          namespace: uniqueNamespace,
          apiBaseUrl: 'http://localhost:3000',
        }),
      ),
    );

    const subscriber = vi.fn();

    store.subscribe(state => state.count, subscriber);

    store.getState().increment();
    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});
