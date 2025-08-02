import { describe, it, expect, afterAll } from 'vitest';
import type { StateCreator } from 'zustand';
import type { MultiplayerOptions } from '../../src/types/multiplayer-types';
import { MAX_Z_FACTOR, MIN_Z_FACTOR } from '../../src/utils/constants';
import { MockHPKVClientFactory } from '../mocks/mock-hpkv-client';
import { createUniqueStoreName, waitFor } from '../utils/test-utils';
import { setupE2EMocks, importAfterMocks } from './setup';

setupE2EMocks();

const { StoreCreator } = await importAfterMocks();

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

const storeCreator = new StoreCreator();
function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, {
    profiling: true,
    ...options,
  });
}

afterAll(async () => {
  await storeCreator.cleanupAllStores();
});

describe('zFactor Tests', () => {
  it('should handle zFactor 0 correctly', async () => {
    const uniqueNamespace = createUniqueStoreName('z-factor-0-test');

    const store = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });

    await waitFor(() => store.getState().multiplayer.hasHydrated);
    store.getState().updateNested(25);
    store.getState().addTodo('Test');
    await new Promise(resolve => setTimeout(resolve, 100));

    const client = MockHPKVClientFactory.findClientsByNamespace(`${uniqueNamespace}-0`)[0];

    await expect(client.get(`${uniqueNamespace}-0:count`)).resolves.toHaveProperty('code', 404);
    await expect(client.get(`${uniqueNamespace}-0:nested`)).resolves.toHaveProperty('code', 200);
    await expect(client.get(`${uniqueNamespace}-0:nested:value`)).resolves.toHaveProperty(
      'code',
      404,
    );
    await expect(client.get(`${uniqueNamespace}-0:todos`)).resolves.toHaveProperty('code', 200);
    await expect(client.get(`${uniqueNamespace}-0:todos:Test`)).resolves.toHaveProperty(
      'code',
      404,
    );
  });

  it('should hydrate the store correctly when zFactor is 0', async () => {
    const uniqueNamespace = createUniqueStoreName('z-factor-0-hydration-test');

    const store = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    store.getState().increment();
    store.getState().setText('Test');
    store.getState().updateNested(25);
    store.getState().updateNested2(25);
    store.getState().updateNested3(25);
    store.getState().addTodo('Test');

    await new Promise(resolve => setTimeout(resolve, 100));

    const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });
    await waitFor(() => store2.getState().multiplayer.hasHydrated);
    await waitFor(() => {
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Test');
      expect(store2.getState().nested.value).toBe(25);
      expect(store2.getState().nested.nested2.value).toBe(25);
      expect(store2.getState().nested.nested2.nested3.value).toBe(25);
      expect(store2.getState().todos['Test']).toBeDefined();
    });
  });

  it('should handle zFactor 1 correctly', async () => {
    const uniqueNamespace = createUniqueStoreName('z-factor-1-test');
    const store = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });

    await waitFor(() => store.getState().multiplayer.hasHydrated);
    const client = MockHPKVClientFactory.findClientsByNamespace(`${uniqueNamespace}-1`)[0];

    store.getState().increment();
    store.getState().updateNested(25);
    store.getState().updateNested2(25);
    store.getState().addTodo('Test');
    await new Promise(resolve => setTimeout(resolve, 100));

    await expect(client.get(`${uniqueNamespace}-1:count`)).resolves.toHaveProperty('code', 200);
    await expect(client.get(`${uniqueNamespace}-1:nested`)).resolves.toHaveProperty('code', 404);
    await expect(client.get(`${uniqueNamespace}-1:nested:value`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-1:nested:nested2`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-1:nested:nested2:value`)).resolves.toHaveProperty(
      'code',
      404,
    );
    await expect(client.get(`${uniqueNamespace}-1:todos:Test`)).resolves.toHaveProperty(
      'code',
      200,
    );
  });

  it('should hydrate the store correctly when zFactor is 1', async () => {
    const uniqueNamespace = createUniqueStoreName('z-factor-1-hydration-test');

    const store = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    store.getState().increment();
    store.getState().setText('Test');
    store.getState().updateNested(25);
    store.getState().updateNested2(25);
    store.getState().updateNested3(25);
    store.getState().addTodo('Test');

    await new Promise(resolve => setTimeout(resolve, 100));

    const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });
    await waitFor(() => store2.getState().multiplayer.hasHydrated);
    await waitFor(() => {
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Test');
      expect(store2.getState().nested.value).toBe(25);
      expect(store2.getState().nested.nested2.value).toBe(25);
      expect(store2.getState().nested.nested2.nested3.value).toBe(25);
      expect(store2.getState().todos['Test']).toBeDefined();
    });
  });

  it('should handle zFactor 2 correctly', async () => {
    const uniqueNamespace = createUniqueStoreName('z-factor-2-test');

    const store = createTestStore({ namespace: uniqueNamespace, zFactor: 2 });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    const client = MockHPKVClientFactory.findClientsByNamespace(`${uniqueNamespace}-2`)[0];

    store.getState().updateNested(25);
    store.getState().updateNested2(25);
    store.getState().updateNested3(25);
    store.getState().addTodo('Test');
    await new Promise(resolve => setTimeout(resolve, 100));

    await expect(client.get(`${uniqueNamespace}-2:nested`)).resolves.toHaveProperty('code', 404);
    await expect(client.get(`${uniqueNamespace}-2:nested:value`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-2:nested:nested2`)).resolves.toHaveProperty(
      'code',
      404,
    );
    await expect(client.get(`${uniqueNamespace}-2:nested:nested2:value`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-2:todos:Test:id`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-2:todos:Test:title`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-2:todos:Test:completed`)).resolves.toHaveProperty(
      'code',
      200,
    );
  });

  it('should hydrate the store correctly when zFactor is 2', async () => {
    const uniqueNamespace = createUniqueStoreName('z-factor-2-hydration-test');

    const store = createTestStore({ namespace: uniqueNamespace, zFactor: 2 });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    store.getState().increment();
    store.getState().setText('Test');
    store.getState().updateNested(25);
    store.getState().updateNested2(25);
    store.getState().updateNested3(25);
    store.getState().addTodo('Test');

    await new Promise(resolve => setTimeout(resolve, 100));

    const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 2 });
    await waitFor(() => store2.getState().multiplayer.hasHydrated);
    await waitFor(() => {
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Test');
      expect(store2.getState().nested.value).toBe(25);
      expect(store2.getState().nested.nested2.value).toBe(25);
      expect(store2.getState().nested.nested2.nested3.value).toBe(25);
      expect(store2.getState().todos['Test']).toBeDefined();
    });
  });

  it('should handle zFactor 3 correctly', async () => {
    const uniqueNamespace = createUniqueStoreName('z-factor-3-test');
    const store = createTestStore({ namespace: uniqueNamespace, zFactor: 3 });

    await waitFor(() => store.getState().multiplayer.hasHydrated);
    const client = MockHPKVClientFactory.findClientsByNamespace(`${uniqueNamespace}-3`)[0];

    store.getState().updateNested(25);
    store.getState().updateNested2(25);
    store.getState().updateNested3(25);
    store.getState().addTodo('Test');
    store.getState().addTodo('Test2');
    store.getState().removeTodo('Test2');
    await new Promise(resolve => setTimeout(resolve, 100));

    await expect(client.get(`${uniqueNamespace}-3:nested`)).resolves.toHaveProperty('code', 404);
    await expect(client.get(`${uniqueNamespace}-3:nested:value`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-3:nested:nested2`)).resolves.toHaveProperty(
      'code',
      404,
    );
    await expect(client.get(`${uniqueNamespace}-3:nested:nested2:value`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-3:nested:nested2:nested3`)).resolves.toHaveProperty(
      'code',
      404,
    );
    await expect(
      client.get(`${uniqueNamespace}-3:nested:nested2:nested3:value`),
    ).resolves.toHaveProperty('code', 200);
    await expect(client.get(`${uniqueNamespace}-3:todos:Test:id`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-3:todos:Test:title`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-3:todos:Test:completed`)).resolves.toHaveProperty(
      'code',
      200,
    );
    await expect(client.get(`${uniqueNamespace}-3:todos:Test2:id`)).resolves.toHaveProperty(
      'code',
      404,
    );
    await expect(client.get(`${uniqueNamespace}-3:todos:Test2:title`)).resolves.toHaveProperty(
      'code',
      404,
    );
    await expect(client.get(`${uniqueNamespace}-3:todos:Test2:completed`)).resolves.toHaveProperty(
      'code',
      404,
    );
  });

  it('should hydrate the store correctly when zFactor is 3', async () => {
    const uniqueNamespace = createUniqueStoreName('z-factor-3-hydration-test');

    const store = createTestStore({ namespace: uniqueNamespace, zFactor: 3 });

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    store.getState().increment();
    store.getState().setText('Test');
    store.getState().updateNested(25);
    store.getState().updateNested2(25);
    store.getState().updateNested3(25);
    store.getState().addTodo('Test');

    await new Promise(resolve => setTimeout(resolve, 100));

    const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 3 });
    await waitFor(() => store2.getState().multiplayer.hasHydrated);
    await waitFor(() => {
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Test');
      expect(store2.getState().nested.value).toBe(25);
      expect(store2.getState().nested.nested2.value).toBe(25);
      expect(store2.getState().nested.nested2.nested3.value).toBe(25);
      expect(store2.getState().todos['Test']).toBeDefined();
    });
  });

  it('should not allow zFactor smaller than 0', async () => {
    const uniqueNamespace = createUniqueStoreName('z-factor-0-test');
    expect(() => createTestStore({ namespace: uniqueNamespace, zFactor: -1 })).toThrowError(
      `Configuration validation failed: Z-factor must be between ${MIN_Z_FACTOR} and ${MAX_Z_FACTOR}`,
    );
  });

  it('should not allow zFactor greater than max allowed', async () => {
    const zFactor = MAX_Z_FACTOR + 1;
    const uniqueNamespace = createUniqueStoreName('z-factor-0-test');
    expect(() => createTestStore({ namespace: uniqueNamespace, zFactor })).toThrowError(
      `Configuration validation failed: Z-factor must be between ${MIN_Z_FACTOR} and ${MAX_Z_FACTOR}`,
    );
  });
});
