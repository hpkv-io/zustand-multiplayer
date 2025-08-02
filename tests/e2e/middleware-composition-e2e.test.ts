import { describe, it, expect, vi, afterAll } from 'vitest';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { WithMultiplayer } from '../../src/types/multiplayer-types';
import { createUniqueStoreName, waitFor, StoreCreator } from '../utils';
import { multiplayer } from '../../src/multiplayer';

interface TestState {
  count: number;
  text: string;
  nested: { value: number; items: string[] };
  todos: Record<string, { id: string; title: string; completed: boolean }>;
  increment: () => void;
  setText: (text: string) => void;
  addTodo: (title: string) => void;
  toggleTodo: (id: string) => void;
  addNestedItem: (item: string) => void;
}

const defaultOptions = {
  apiKey: process.env.HPKV_API_KEY!,
  apiBaseUrl: process.env.HPKV_API_BASE_URL!,
};

const createTestStore = (namespace: string) => {
  return create<WithMultiplayer<TestState>>()(
    multiplayer(
      subscribeWithSelector(
        immer(set => ({
          count: 0,
          text: '',
          nested: { value: 0, items: [] },
          todos: {},
          increment: () => set(state => ({ count: state.count + 1 })),
          setText: (text: string) => set({ text }),
          addTodo: (title: string) =>
            set(state => ({
              todos: { ...state.todos, [title]: { id: title, title, completed: false } },
            })),
          toggleTodo: (id: string) =>
            set(state => ({
              todos: {
                ...state.todos,
                [id]: { ...state.todos[id], completed: !state.todos[id].completed },
              },
            })),
          addNestedItem: (item: string) =>
            set(state => ({ nested: { ...state.nested, items: [...state.nested.items, item] } })),
        })),
      ),
      { namespace, ...defaultOptions },
    ),
  );
};

describe('Multiplayer Middleware Composition', () => {
  const storeCreator = new StoreCreator();

  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  it('should work with subscribeWithSelector middleware', async () => {
    const store = createTestStore(createUniqueStoreName('middleware-test'));
    const subscriber = vi.fn();
    store.subscribe(state => state.count, subscriber);

    store.getState().increment();
    store.getState().setText('No Trigger');

    await new Promise(resolve => setTimeout(resolve, 100));
    await waitFor(() => expect(subscriber).toHaveBeenCalledTimes(1));
  });

  it('should work with immer middleware', async () => {
    const store = createTestStore(createUniqueStoreName('multiplayer-immer'));

    await waitFor(() => store.getState().multiplayer.hasHydrated);

    store.getState().increment();
    store.getState().setText('Hello Immer');
    store.getState().addTodo('Test Todo');

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(store.getState().count).toBe(1);
    expect(store.getState().text).toBe('Hello Immer');
    expect(Object.keys(store.getState().todos).length).toBe(1);

    await store.getState().multiplayer.destroy();
  });

  it('should sync state between clients with immer composition', async () => {
    const namespace = createUniqueStoreName('immer-sync');
    const [store1, store2] = [createTestStore(namespace), createTestStore(namespace)];

    await Promise.all([
      waitFor(() => store1.getState().multiplayer.hasHydrated),
      waitFor(() => store2.getState().multiplayer.hasHydrated),
    ]);

    store1.getState().increment();
    store1.getState().setText('Synced Text');
    store1.getState().addNestedItem('Item 1');

    await waitFor(() => {
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Synced Text');
      expect(store2.getState().nested.items).toContain('Item 1');
    });

    await Promise.all([
      store1.getState().multiplayer.destroy(),
      store2.getState().multiplayer.destroy(),
    ]);
  });
});
