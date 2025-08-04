import { HPKVApiClient, HPKVClientFactory } from '@hpkv/websocket-client';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type StateCreator } from 'zustand';
import type { MultiplayerOptions } from '../../src/types/multiplayer-types';
import { StoreCreator } from '../utils/store-creator';
import { createUniqueStoreName, waitFor } from '../utils/test-utils';

interface TestState {
  count: number;
  text: string;
  nested: {
    value: number;
    nested2: {
      value: number;
      nested3: {
        value: number;
      };
    };
  };
  todos: Record<string, { id: string; title: string; completed: boolean }>;
  increment: () => void;
  decrement: () => void;
  setText: (text: string) => void;
  updateNested: (value: number) => void;
  updateNested2: (value: number) => void;
  updateNested3: (value: number) => void;
  addTodo: (title: string) => void;
  removeTodo: (title: string) => void;
}

const initializer: StateCreator<TestState, [], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0, nested2: { value: 0, nested3: { value: 0 } } },
  todos: {},
  increment: () => set(state => ({ count: state.count + 1 })),
  decrement: () => set(state => ({ count: state.count - 1 })),
  setText: (text: string) => set({ text }),
  updateNested: (value: number) => set(state => ({ nested: { ...state.nested, value } })),
  updateNested2: (value: number) =>
    set(state => ({
      nested: {
        ...state.nested,
        nested2: { ...state.nested.nested2, value },
      },
    })),
  updateNested3: (value: number) =>
    set(state => ({
      nested: {
        ...state.nested,
        nested2: {
          ...state.nested.nested2,
          nested3: { ...state.nested.nested2.nested3, value },
        },
      },
    })),
  addTodo: (title: string) =>
    set(state => ({
      todos: {
        ...state.todos,
        [title]: { id: title, title, completed: false },
      },
    })),
  removeTodo: (title: string) =>
    set(state => {
      const { [title]: _, ...rest } = state.todos;
      return { todos: rest };
    }),
});

describe('Multiplayer Persistence Tests', () => {
  const skip = !process.env.HPKV_API_KEY || !process.env.HPKV_API_BASE_URL;
  let helperClient: HPKVApiClient;
  const storeCreator = new StoreCreator();

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
    options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
  ) {
    return storeCreator.createStore<TestState>(initializer, {
      apiKey: process.env.HPKV_API_KEY,
      apiBaseUrl: process.env.HPKV_API_BASE_URL,
      ...options,
    });
  }

  describe('Baasic Persistence Tests', () => {
    it('should create keys with correct namespace formatting', async () => {
      const uniqueNamespace = createUniqueStoreName('storage-keys-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      store.getState().increment();
      store.getState().setText('Test Text');
      store.getState().updateNested(25);
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(helperClient.get(`${uniqueNamespace}-2:count`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:text`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:nested:value`)).resolves.toHaveProperty(
        'code',
        200,
      );
    });

    it('should not persist function properties', async () => {
      const uniqueNamespace = createUniqueStoreName('no-function-sync-test');
      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);
      store.getState().increment();
      store.getState().setText('Synced Text');
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(helperClient.get(`${uniqueNamespace}-2:count`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:increment`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:decrement`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:setText`)).rejects.toThrow(
        'Record not found',
      );
    });

    it.skipIf(skip)('should remove the keys when clearStorage is called', async () => {
      const uniqueNamespace = createUniqueStoreName('integration-clear-storage-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().increment();
      store1.getState().setText('Will be cleared');

      await waitFor(async () => {
        const count = await helperClient.get(`${uniqueNamespace}-2:count`);
        const text = await helperClient.get(`${uniqueNamespace}-2:text`);
        expect(count.code).toBe(200);
        expect(text.code).toBe(200);
      });

      await store1.multiplayer.clearStorage();

      await expect(helperClient.get(`${uniqueNamespace}-2:count`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:text`)).rejects.toThrow(
        'Record not found',
      );
    });
  });

  describe('zFactor Persistence Tests', () => {
    it('should handle zFactor 0 storage correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('z-factor-0-test');

      const store = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });

      await waitFor(() => store.getState().multiplayer.hasHydrated);
      store.getState().updateNested(25);
      store.getState().addTodo('Test');
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(helperClient.get(`${uniqueNamespace}-0:count`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-0:nested`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-0:nested:value`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-0:todos`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-0:todos:Test`)).rejects.toThrow(
        'Record not found',
      );
    });

    it('should handle zFactor 1 storage correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('z-factor-1-test');
      const store = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      store.getState().increment();
      store.getState().updateNested(25);
      store.getState().updateNested2(25);
      store.getState().addTodo('Test');
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(helperClient.get(`${uniqueNamespace}-1:count`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-1:nested`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-1:nested:value`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-1:nested:nested2`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-1:nested:nested2:value`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-1:todos:Test`)).resolves.toHaveProperty(
        'code',
        200,
      );
    });

    it('should handle zFactor 2 correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('z-factor-2-test');

      const store = createTestStore({ namespace: uniqueNamespace, zFactor: 2 });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      store.getState().updateNested(25);
      store.getState().updateNested2(25);
      store.getState().updateNested3(25);
      store.getState().addTodo('Test');
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(helperClient.get(`${uniqueNamespace}-2:nested`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:nested:value`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-2:nested:nested2`)).rejects.toThrow(
        'Record not found',
      );
      await expect(
        helperClient.get(`${uniqueNamespace}-2:nested:nested2:value`),
      ).resolves.toHaveProperty('code', 200);
      await expect(helperClient.get(`${uniqueNamespace}-2:todos:Test:id`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(
        helperClient.get(`${uniqueNamespace}-2:todos:Test:title`),
      ).resolves.toHaveProperty('code', 200);
      await expect(
        helperClient.get(`${uniqueNamespace}-2:todos:Test:completed`),
      ).resolves.toHaveProperty('code', 200);
    });

    it('should handle zFactor 3 correctly', async () => {
      const uniqueNamespace = createUniqueStoreName('z-factor-3-test');
      const store = createTestStore({ namespace: uniqueNamespace, zFactor: 3 });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      store.getState().updateNested(25);
      store.getState().updateNested2(25);
      store.getState().updateNested3(25);
      store.getState().addTodo('Test');
      store.getState().addTodo('Test2');
      store.getState().removeTodo('Test2');
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(helperClient.get(`${uniqueNamespace}-3:nested`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-3:nested:value`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(helperClient.get(`${uniqueNamespace}-3:nested:nested2`)).rejects.toThrow(
        'Record not found',
      );
      await expect(
        helperClient.get(`${uniqueNamespace}-3:nested:nested2:value`),
      ).resolves.toHaveProperty('code', 200);
      await expect(helperClient.get(`${uniqueNamespace}-3:nested:nested2:nested3`)).rejects.toThrow(
        'Record not found',
      );
      await expect(
        helperClient.get(`${uniqueNamespace}-3:nested:nested2:nested3:value`),
      ).resolves.toHaveProperty('code', 200);
      await expect(helperClient.get(`${uniqueNamespace}-3:todos:Test:id`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(
        helperClient.get(`${uniqueNamespace}-3:todos:Test:title`),
      ).resolves.toHaveProperty('code', 200);
      await expect(
        helperClient.get(`${uniqueNamespace}-3:todos:Test:completed`),
      ).resolves.toHaveProperty('code', 200);
      await expect(helperClient.get(`${uniqueNamespace}-3:todos:Test2:id`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-3:todos:Test2:title`)).rejects.toThrow(
        'Record not found',
      );
      await expect(helperClient.get(`${uniqueNamespace}-3:todos:Test2:completed`)).rejects.toThrow(
        'Record not found',
      );
    });
  });
});
