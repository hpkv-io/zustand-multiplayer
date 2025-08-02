import { ConnectionState, HPKVApiClient, HPKVClientFactory } from '@hpkv/websocket-client';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { StateCreator, StoreApi, UseBoundStore } from 'zustand';
import type {
  MultiplayerOptions,
  WithMultiplayer,
  WithMultiplayerMiddleware,
} from '../../src/types/multiplayer-types';
import { StoreCreator } from '../utils/store-creator';
import { createUniqueStoreName, waitFor } from '../utils/test-utils';

interface TestState {
  count: number;
  text: string;
  nested: {
    value: number;
    text: string;
    completed: boolean;
  };
  todos: Record<string, { id: string; text: string; completed: boolean }>;
  increment: () => void;
  decrement: () => void;
  setText: (text: string) => void;
  updateNestedValue: (value: number) => void;
  updateNestedText: (text: string) => void;
  addTodo: (todo: { id: string; text: string; completed: boolean }) => void;
  toggleTodo: (id: string) => void;
}

type TestZustandStore = UseBoundStore<
  WithMultiplayerMiddleware<StoreApi<WithMultiplayer<TestState>>, WithMultiplayer<TestState>>
>;

const initializer: StateCreator<TestState, [], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0, text: '', completed: false },
  todos: {},
  increment: () =>
    set(state => ({
      count: state.count + 1,
    })),
  decrement: () =>
    set(state => ({
      count: state.count - 1,
    })),
  setText: (text: string) => set({ text }),
  updateNestedValue: (value: number) => set(state => ({ nested: { ...state.nested, value } })),
  updateNestedText: (text: string) => set(state => ({ nested: { ...state.nested, text } })),
  addTodo: (todo: { id: string; text: string; completed: boolean }) =>
    set(state => ({
      todos: {
        ...state.todos,
        [todo.id]: todo,
      },
    })),
  toggleTodo: (id: string) =>
    set(state => ({
      todos: {
        ...state.todos,
        [id]: { ...state.todos[id], completed: !state.todos[id].completed },
      },
    })),
});

describe('Conflict Resolution Integration Tests', () => {
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
  ): TestZustandStore {
    return storeCreator.createStore<TestState>(initializer, {
      apiKey: process.env.HPKV_API_KEY,
      apiBaseUrl: process.env.HPKV_API_BASE_URL,
      ...options,
    });
  }

  describe('Conflict management tests', () => {
    describe('Hydration conflict resolution scenarios', () => {
      it.skipIf(skip)('should resolve conflicts using keep-remote strategy', async () => {
        const uniqueNamespace = createUniqueStoreName('conflict-resolution-remote-test');
        const store1 = createTestStore({ namespace: uniqueNamespace });
        const store2 = createTestStore({
          namespace: uniqueNamespace,
          onConflict: _conflicts => {
            return {
              strategy: 'keep-remote',
            };
          },
        });

        await waitFor(() => {
          expect(store1.getState().multiplayer.hasHydrated).toBe(true);
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
        });

        await store2.getState().multiplayer.disconnect();

        store1.getState().setText('store 1 update');
        store1.getState().increment();
        await new Promise(resolve => setTimeout(resolve, 100));
        store2.getState().setText('Missing store1 update');

        await waitFor(() => {
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
        });

        await waitFor(
          () => {
            expect(store1.getState().text).toBe('store 1 update');
            expect(store1.getState().count).toBe(1);
            expect(store2.getState().text).toBe('store 1 update');
            expect(store2.getState().count).toBe(1);
          },
          { timeout: 10000, interval: 200 },
        );
      });

      it.skipIf(skip)('should resolve conflicts using keep-local strategy', async () => {
        const uniqueNamespace = createUniqueStoreName('conflict-resolution-local-test');
        const store1 = createTestStore({ namespace: uniqueNamespace });
        const store2 = createTestStore({
          namespace: uniqueNamespace,
          onConflict: _conflicts => {
            return {
              strategy: 'keep-local',
            };
          },
        });

        await waitFor(() => {
          expect(store1.getState().multiplayer.hasHydrated).toBe(true);
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
        });

        await store2.getState().multiplayer.disconnect();

        store1.getState().setText('store 1 update');
        store1.getState().increment();
        await new Promise(resolve => setTimeout(resolve, 100));
        store2.getState().setText('Overwritten by store 2');

        await waitFor(() => {
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
        });

        await waitFor(
          () => {
            expect(store1.getState().text).toBe('Overwritten by store 2');
            expect(store1.getState().count).toBe(1);
            expect(store2.getState().text).toBe('Overwritten by store 2');
            expect(store2.getState().count).toBe(1);
          },
          { timeout: 10000, interval: 200 },
        );
      });

      it.skipIf(skip)('should resolve conflicts using custom-merge strategy', async () => {
        const uniqueNamespace = createUniqueStoreName('conflict-resolution-merge-test');
        const store1 = createTestStore({ namespace: uniqueNamespace });
        const store2 = createTestStore({
          namespace: uniqueNamespace,
          onConflict: conflicts => {
            return {
              strategy: 'merge',
              mergedValues: {
                text: `${conflicts[0].remoteValue as string} ${conflicts[0].pendingValue as string}`,
              },
            };
          },
        });
        await waitFor(() => {
          expect(store1.getState().multiplayer.hasHydrated).toBe(true);
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
        });

        await store2.getState().multiplayer.disconnect();
        store1.getState().setText('store 1 update');
        store2.getState().setText('store 2 update');
        await store2.getState().multiplayer.connect();
        await waitFor(() => {
          expect(store2.getState().multiplayer.connectionState).toBe(ConnectionState.CONNECTED);
        });

        await waitFor(() => {
          expect(store1.getState().text).toBe('store 1 update store 2 update');
          expect(store2.getState().text).toBe('store 1 update store 2 update');
        });
      });

      it.skipIf(skip)(
        'should resolve conflicts using keep-remote strategy by default',
        async () => {
          const uniqueNamespace = createUniqueStoreName('conflict-resolution-remote-test');
          const store1 = createTestStore({ namespace: uniqueNamespace });
          const store2 = createTestStore({ namespace: uniqueNamespace });

          await waitFor(() => {
            expect(store1.getState().multiplayer.hasHydrated).toBe(true);
            expect(store2.getState().multiplayer.hasHydrated).toBe(true);
          });

          await store2.getState().multiplayer.disconnect();

          store1.getState().setText('store 1 update');
          store1.getState().increment();
          await new Promise(resolve => setTimeout(resolve, 100));
          store2.getState().setText('Missing store1 update');

          await waitFor(() => {
            expect(store2.getState().multiplayer.hasHydrated).toBe(true);
          });

          await waitFor(
            () => {
              expect(store1.getState().text).toBe('store 1 update');
              expect(store1.getState().count).toBe(1);
              expect(store2.getState().text).toBe('store 1 update');
              expect(store2.getState().count).toBe(1);
            },
            { timeout: 10000, interval: 200 },
          );
        },
      );
    });
  });

  describe('Conflict reduction using zFactor', () => {
    it.skipIf(skip)('should avoid top level property conflicts with zFactor 0', async () => {
      const uniqueNamespace = createUniqueStoreName('conflict-reduction-zfactor-0-test');
      const store1 = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });
      const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 0 });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().setText('update 1');
      store2.getState().increment();
      store1.getState().setText('update 2');
      store2.getState().increment();
      store1.getState().setText('update 3');
      store2.getState().increment();

      await waitFor(() => {
        expect(store1.getState().text).toBe('update 3');
        expect(store2.getState().text).toBe('update 3');
        expect(store1.getState().count).toBe(3);
        expect(store2.getState().count).toBe(3);
      });
    });

    it.skipIf(skip)('should avoid second level property conflicts with zFactor 1', async () => {
      const uniqueNamespace = createUniqueStoreName('conflict-reduction-zfactor-1-test');
      const store1 = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });
      const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 1 });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().updateNestedText('update 1');
      store2.getState().updateNestedValue(1);
      store1.getState().updateNestedText('update 2');
      store2.getState().updateNestedValue(2);
      store1.getState().updateNestedText('update 3');
      store2.getState().updateNestedValue(3);

      await waitFor(() => {
        expect(store1.getState().nested.text).toBe('update 3');
        expect(store2.getState().nested.text).toBe('update 3');
        expect(store1.getState().nested.value).toBe(3);
        expect(store2.getState().nested.value).toBe(3);
      });
    });

    it.skipIf(skip)('should avoid third level property conflicts with zFactor 2', async () => {
      const uniqueNamespace = createUniqueStoreName('conflict-reduction-zfactor-2-test');
      const store1 = createTestStore({ namespace: uniqueNamespace, zFactor: 2 });
      const store2 = createTestStore({ namespace: uniqueNamespace, zFactor: 2 });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().addTodo({ id: '1', text: 'do the dishes', completed: false });
      store2.getState().addTodo({ id: '2', text: 'do the laundry', completed: false });
      await waitFor(() => {
        expect(store1.getState().todos['1'].text).toBe('do the dishes');
        expect(store2.getState().todos['1'].text).toBe('do the dishes');
        expect(store1.getState().todos['2'].text).toBe('do the laundry');
        expect(store2.getState().todos['2'].text).toBe('do the laundry');
      });

      store1.getState().toggleTodo('2');
      store2.getState().toggleTodo('1');
      store1.getState().toggleTodo('2');
      store2.getState().toggleTodo('1');

      await waitFor(() => {
        expect(store1.getState().todos['1'].text).toBe('do the dishes');
        expect(store2.getState().todos['1'].text).toBe('do the dishes');
        expect(store1.getState().todos['2'].text).toBe('do the laundry');
        expect(store2.getState().todos['2'].text).toBe('do the laundry');
        expect(store1.getState().todos['1'].completed).toBe(false);
        expect(store2.getState().todos['1'].completed).toBe(false);
        expect(store1.getState().todos['2'].completed).toBe(false);
        expect(store2.getState().todos['2'].completed).toBe(false);
      });
    });
  });
});
