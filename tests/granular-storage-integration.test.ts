import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StoreCreator } from './utils/store-creator';
import { MultiplayerOptions } from '../src/multiplayer';
import { LogLevel } from '../src/logger';
import { createUniqueStoreName, waitFor } from './utils/test-utils';
import { StateCreator } from 'zustand';
import { StoreApi, UseBoundStore } from 'zustand';
import { WithMultiplayer } from '../src/multiplayer';

// Test state interface with Record fields for granular storage
interface GranularTestState {
  todos: Record<string, { text: string; completed: boolean; priority: number }>;
  users: Record<string, { name: string; email: string; lastSeen: number }>;
  settings: { theme: string; notifications: boolean };
  counter: number;
}

// Create type for our test store with multiplayer
type GranularTestStore = UseBoundStore<StoreApi<WithMultiplayer<GranularTestState>>>;

const initializer: StateCreator<
  GranularTestState,
  [['zustand/multiplayer', unknown]],
  []
> = set => ({
  todos: {},
  users: {},
  settings: { theme: 'light', notifications: true },
  counter: 0,
});

describe('Granular Storage Integration Tests', () => {
  // Skip tests if environment variables are not set
  const skip = !process.env.HPKV_API_KEY || !process.env.HPKV_API_BASE_URL;

  const storeCreator = new StoreCreator();
  let defaultMultiplayerOptions: Partial<MultiplayerOptions<GranularTestState>>;

  beforeAll(() => {
    defaultMultiplayerOptions = {
      apiKey: process.env.HPKV_API_KEY,
      apiBaseUrl: process.env.HPKV_API_BASE_URL,
      logLevel: LogLevel.DEBUG,
    };
  });

  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  function createTestStore(
    options?:
      | Partial<MultiplayerOptions<GranularTestState>>
      | MultiplayerOptions<GranularTestState>,
  ): GranularTestStore {
    return storeCreator.createStore<GranularTestState>(initializer, {
      ...defaultMultiplayerOptions,
      ...options,
    });
  }

  describe('Basic Granular Operations', () => {
    it.skipIf(skip)('should handle granular updates for Record fields', async () => {
      const uniqueNamespace = createUniqueStoreName('granular-updates-test');
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

      // Store1 adds a todo - use type assertion for updateDraft
      const state1 = store1.getState() as any;
      await state1.updateDraft?.(draft => {
        draft.todos['todo-1'] = { text: 'First todo', completed: false, priority: 1 };
      });

      // Store2 adds a different todo
      const state2 = store2.getState() as any;
      await state2.updateDraft?.(draft => {
        draft.todos['todo-2'] = { text: 'Second todo', completed: false, priority: 2 };
      });

      // Wait for synchronization
      await waitFor(
        () => {
          const finalState1 = store1.getState();
          const finalState2 = store2.getState();

          expect(finalState1.todos['todo-1']).toEqual({
            text: 'First todo',
            completed: false,
            priority: 1,
          });
          expect(finalState1.todos['todo-2']).toEqual({
            text: 'Second todo',
            completed: false,
            priority: 2,
          });
          expect(finalState2.todos['todo-1']).toEqual({
            text: 'First todo',
            completed: false,
            priority: 1,
          });
          expect(finalState2.todos['todo-2']).toEqual({
            text: 'Second todo',
            completed: false,
            priority: 2,
          });
        },
        { timeout: 10000, interval: 200 },
      );
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
      const state1 = store1.getState() as any;
      await state1.updateDraft?.(draft => {
        draft.todos['todo-1'] = { text: 'Todo 1', completed: false, priority: 1 };
        draft.todos['todo-2'] = { text: 'Todo 2', completed: false, priority: 2 };
        draft.todos['todo-3'] = { text: 'Todo 3', completed: false, priority: 3 };
      });

      // Wait for sync
      await waitFor(() => {
        const finalState2 = store2.getState();
        expect(Object.keys(finalState2.todos)).toHaveLength(3);
      });

      // Store2 deletes one todo
      const state2 = store2.getState() as any;
      await state2.updateDraft?.(draft => {
        draft.todos.__granular_delete__('todo-2');
      });

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

    it.skipIf(skip)('should handle concurrent edits without conflicts', async () => {
      const uniqueNamespace = createUniqueStoreName('concurrent-edits-test');
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

      // Add initial todo
      const state1 = store1.getState() as any;
      await state1.updateDraft?.(draft => {
        draft.todos['shared-todo'] = { text: 'Original text', completed: false, priority: 1 };
      });

      // Wait for sync
      await waitFor(() => {
        const finalState2 = store2.getState();
        expect(finalState2.todos['shared-todo']).toBeDefined();
      });

      // Concurrent updates to the same todo (different properties)
      const state2 = store2.getState() as any;
      await Promise.all([
        state1.updateDraft?.(draft => {
          if (draft.todos['shared-todo']) {
            draft.todos['shared-todo'].completed = true;
          }
        }),
        state2.updateDraft?.(draft => {
          if (draft.todos['shared-todo']) {
            draft.todos['shared-todo'].priority = 5;
          }
        }),
      ]);

      // Wait for sync and verify both updates applied
      await waitFor(
        () => {
          const finalState1 = store1.getState();
          const finalState2 = store2.getState();

          expect(finalState1.todos['shared-todo'].completed).toBe(true);
          expect(finalState1.todos['shared-todo'].priority).toBe(5);
          expect(finalState2.todos['shared-todo'].completed).toBe(true);
          expect(finalState2.todos['shared-todo'].priority).toBe(5);
        },
        { timeout: 10000, interval: 200 },
      );
    });
  });

  describe('Mixed Storage Strategies', () => {
    it.skipIf(skip)('should handle both granular and traditional fields together', async () => {
      const uniqueNamespace = createUniqueStoreName('mixed-storage-test');
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

      // Update granular field (todos)
      const state1 = store1.getState() as any;
      await state1.updateDraft?.(draft => {
        draft.todos['todo-1'] = { text: 'Granular todo', completed: false, priority: 1 };
      });

      // Update traditional field (counter) using regular set
      store2.setState((state: GranularTestState) => ({
        ...state,
        counter: state.counter + 1,
      }));

      // Wait for sync and verify both updates
      await waitFor(
        () => {
          const finalState1 = store1.getState();
          const finalState2 = store2.getState();

          expect(finalState1.todos['todo-1']).toEqual({
            text: 'Granular todo',
            completed: false,
            priority: 1,
          });
          expect(finalState1.counter).toBe(1);
          expect(finalState2.todos['todo-1']).toEqual({
            text: 'Granular todo',
            completed: false,
            priority: 1,
          });
          expect(finalState2.counter).toBe(1);
        },
        { timeout: 10000, interval: 200 },
      );
    });
  });

  describe('Backward Compatibility', () => {
    it.skipIf(skip)('should work alongside traditional Zustand updates', async () => {
      const uniqueNamespace = createUniqueStoreName('backward-compatibility-test');
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

      // Mix granular and traditional updates
      const state1 = store1.getState() as any;
      await state1.updateDraft?.(draft => {
        draft.todos['todo-1'] = { text: 'Granular update', completed: false, priority: 1 };
      });

      // Traditional update
      store1.setState((state: GranularTestState) => ({
        ...state,
        counter: 42,
        todos: {
          ...state.todos,
          'todo-2': { text: 'Traditional update', completed: true, priority: 2 },
        },
      }));

      // Wait for sync and verify both updates work
      await waitFor(
        () => {
          const finalState2 = store2.getState();
          expect(finalState2.todos['todo-1']).toEqual({
            text: 'Granular update',
            completed: false,
            priority: 1,
          });
          expect(finalState2.todos['todo-2']).toEqual({
            text: 'Traditional update',
            completed: true,
            priority: 2,
          });
          expect(finalState2.counter).toBe(42);
        },
        { timeout: 10000, interval: 200 },
      );
    });
  });
});
