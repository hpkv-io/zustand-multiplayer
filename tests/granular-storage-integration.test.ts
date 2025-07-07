import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StoreCreator } from './utils/store-creator';
import { ImmerStateCreator, MultiplayerOptions, WithMultiplayerMiddleware } from '../src/multiplayer';
import { LogLevel } from '../src/logger';
import { createUniqueStoreName, waitFor } from './utils/test-utils';
import { StoreApi, UseBoundStore } from 'zustand';
import { WithMultiplayer } from '../src/multiplayer';

// Test state interface with Record fields for granular storage
interface TodosState {
  todos: Record<string, { text: string; completed: boolean; priority: number }>;
  addTodo: (id: string, todo: { text: string; completed: boolean; priority: number }) => void;
  removeTodo: (id: string) => void;
}

// Create type for our test store with multiplayer
type TodoStore = UseBoundStore<WithMultiplayerMiddleware<StoreApi<WithMultiplayer<TodosState>>, WithMultiplayer<TodosState>>>;

const initializer: ImmerStateCreator<
  TodosState,
  [['zustand/multiplayer', unknown]],
  []
> = set => ({
  todos: {},
  addTodo: (id: string, todo: { text: string; completed: boolean; priority: number }) =>
    set(state => {
      state.todos[id] = todo;
    }),
  removeTodo: (id: string) =>
    set(state => {
        delete state.todos[id];
    })
});

describe('Granular Storage Integration Tests', () => {
  // Skip tests if environment variables are not set
  const skip = !process.env.HPKV_API_KEY || !process.env.HPKV_API_BASE_URL;

  const storeCreator = new StoreCreator();
  let defaultMultiplayerOptions: Partial<MultiplayerOptions<TodosState>>;

  beforeAll(() => {
    defaultMultiplayerOptions = {
      apiKey: process.env.HPKV_API_KEY,
      apiBaseUrl: process.env.HPKV_API_BASE_URL,
      logLevel: LogLevel.DEBUG,
      clientConfig: {
        throttling: {
          enabled: true,
          rateLimit: 10,
        },
      },
    };
  });

  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  function createTestStore(
    options?:
      | Partial<MultiplayerOptions<TodosState>>
      | MultiplayerOptions<TodosState>,
  ): TodoStore {
    return storeCreator.createStore<TodosState>(initializer, {
      ...defaultMultiplayerOptions,
      ...options,
    });
  }

  describe('Basic Granular Operations', () => {
    it.skipIf(skip)('should handle granular updates for Record fields', async () => {
      const uniqueNamespace = createUniqueStoreName('granular-updates-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      // Wait for initial hydration
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().addTodo('todo-1', { text: 'First todo', completed: false, priority: 1 });
      store2.getState().addTodo('todo-2', { text: 'Second todo', completed: false, priority: 2 });

      // Wait for synchronization
      await waitFor(
        () => {
          expect(store1.getState().todos['todo-1']).toEqual({
            text: 'First todo',
            completed: false,
            priority: 1,
          });
          expect(store1.getState().todos['todo-2']).toEqual({
            text: 'Second todo',
            completed: false,
            priority: 2,
          });
          expect(store2.getState().todos['todo-1']).toEqual({
            text: 'First todo',
            completed: false,
            priority: 1,
          });
          expect(store2.getState().todos['todo-2']).toEqual({
            text: 'Second todo',
            completed: false,
            priority: 2,
          });
        });
    });

    it.skipIf(skip)('should handle granular deletions', async () => {
      const uniqueNamespace = createUniqueStoreName('granular-deletions-test');
      const store1 = createTestStore({
        namespace: uniqueNamespace,
      });

      const store2 = createTestStore({
        namespace: uniqueNamespace,
      });

      // Wait for initial hydration
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Add initial todos
      store1.getState().addTodo('todo-1', { text: 'Todo 1', completed: false, priority: 1 });
      store1.getState().addTodo('todo-2', { text: 'Todo 2', completed: false, priority: 2 });
      store1.getState().addTodo('todo-3', { text: 'Todo 3', completed: false, priority: 3 });

      // Wait for sync
      await waitFor(() => {
        const finalState2 = store2.getState();
        expect(Object.keys(finalState2.todos)).toHaveLength(3);
      });

      store1.getState().removeTodo('todo-2');

      // Wait for sync and verify deletion
      await waitFor(
        () => {
          const finalState1 = store1.getState();
          const finalState2 = store2.getState();

          expect(finalState1.todos['todo-1']).toBeDefined();
          expect(finalState1.todos['todo-2']).toBeUndefined();
          expect(finalState1.todos['todo-3']).toBeDefined();
          expect(finalState2.todos['todo-1']).toBeDefined();
          expect(finalState2.todos['todo-2']).toBeUndefined();
          expect(finalState2.todos['todo-3']).toBeDefined();
        },
        { timeout: 10000, interval: 200 },
      );
    });
  });
});
