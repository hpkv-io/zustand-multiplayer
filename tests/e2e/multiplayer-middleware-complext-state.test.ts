import { describe, it, expect, vi, afterAll } from 'vitest';
import { ImmerStateCreator, MultiplayerOptions } from '../../src/types/multiplayer-types';
import { createUniqueStoreName, waitFor } from '../utils/test-utils';
import { MockTokenHelper } from '../mocks/mock-token-manager';
import { MockWebsocketTokenManager } from '../mocks/mock-token-manager';
import { MockHPKVClientFactory } from '../mocks/mock-hpkv-client';

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

vi.doMock('../../src/auth/token-helper', () => {
  return {
    TokenHelper: MockTokenHelper,
  };
});

const { StoreCreator } = await import('../utils/store-creator');

interface ComplexState {
  items: Array<{
    id: string;
    name: string;
  }>;
  settings: {
    theme: 'light' | 'dark';
    notifications: {
      enabled: boolean;
      frequency: number;
    };
  };
  todos: Record<string, { id: string; text: string; completed: boolean }>;
  users: Record<string, { id: string; name: string; email: string }>;
  addTodo: (todo: { id: string; text: string; completed: boolean }) => void;
  removeTodo: (id: string) => void;
  updateTodo: (id: string, updates: Partial<{ text: string; completed: boolean }>) => void;
  addItem: (name: string) => void;
  removeItem: (id: string) => void;
  updateTheme: (theme: 'light' | 'dark') => void;
  updateNotifications: (enabled: boolean, frequency: number) => void;
}

const initializer: ImmerStateCreator<
  ComplexState,
  [['zustand/multiplayer', unknown]],
  []
> = set => ({
  items: [],
  todos: {},
  users: {},
  settings: {
    theme: 'light',
    notifications: {
      enabled: true,
      frequency: 15,
    },
  },
  addTodo: todo =>
    set(state => {
      state.todos[todo.id] = todo;
    }),
  removeTodo: id =>
    set(draft => {
      delete draft.todos[id];
    }),
  updateTodo: (id, updates) =>
    set(state => {
      if (state.todos[id]) {
        state.todos[id] = {
          ...state.todos[id],
          ...updates,
        };
      }
    }),
  addItem: (name: string) =>
    set(state => {
      state.items.push({
        id: `${Math.random().toString(36).substring(2, 15)}`,
        name,
      });
    }),
  removeItem: (id: string) =>
    set(state => {
      state.items = state.items.filter(item => item.id !== id);
    }),
  updateTheme: theme =>
    set(state => {
      state.settings.theme = theme;
    }),
  updateNotifications: (enabled, frequency: number) =>
    set(state => {
      state.settings.notifications.enabled = enabled;
      state.settings.notifications.frequency = frequency;
    }),
});

const storeCreator = new StoreCreator();

function createTestStore(options?: Partial<MultiplayerOptions<ComplexState>>) {
  return storeCreator.createStore<ComplexState>(initializer, options);
}

describe('Multiplayer Middleware Complex State Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  describe('Record Type Support', () => {
    it('should sync adding new records', async () => {
      const uniqueNamespace = createUniqueStoreName('record-sync-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      const todo1 = { id: '1', text: 'Todo 1', completed: false };
      const todo2 = { id: '2', text: 'Todo 2', completed: true };

      store1.getState().addTodo(todo1);
      store2.getState().addTodo(todo2);

      await waitFor(() => {
        expect(store1.getState().todos['2']).toEqual(todo2);
        expect(store2.getState().todos['1']).toEqual(todo1);
      });
    });

    it('should sync updating existing records', async () => {
      const uniqueNamespace = createUniqueStoreName('record-sync-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      const todo1 = { id: '1', text: 'Todo 1', completed: false };
      const todo2 = { id: '2', text: 'Todo 2', completed: true };

      store1.getState().addTodo(todo1);
      store2.getState().addTodo(todo2);

      await waitFor(() => {
        expect(store1.getState().todos['1']).toEqual(todo1);
        expect(store2.getState().todos['2']).toEqual(todo2);
      });

      store1.getState().updateTodo('1', { completed: true });
      store2.getState().updateTodo('2', { completed: false });

      await waitFor(() => {
        expect(store1.getState().todos['1'].completed).toBe(true);
        expect(store2.getState().todos['2'].completed).toBe(false);
      });
    });

    it('should handle Record entry deletion', async () => {
      const uniqueNamespace = createUniqueStoreName('record-delete-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      const todo = { id: '1', text: 'To Delete', completed: false };
      store1.getState().addTodo(todo);

      await waitFor(() => {
        expect(store2.getState().todos['1']).toBeDefined();
      });

      store1.getState().removeTodo('1');

      await waitFor(() => {
        expect(store2.getState().todos['1']).toBeUndefined();
      });
    });

    it('should delete the keys when the record entry is deleted', async () => {
      const uniqueNamespace = createUniqueStoreName('record-delete-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().addTodo({ id: '1', text: 'To Delete', completed: false });
      store1.getState().addTodo({ id: '2', text: 'To Delete', completed: false });

      await new Promise(resolve => setTimeout(resolve, 100));

      const client = MockHPKVClientFactory.findClientsByNamespace(uniqueNamespace)[0];
      // Check that granular keys exist for todo 1
      console.log(`Checking if granular keys exist for todo 1`);
      await expect(client.get(`${uniqueNamespace}:todos:1:id`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(client.get(`${uniqueNamespace}:todos:1:text`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(client.get(`${uniqueNamespace}:todos:1:completed`)).resolves.toHaveProperty(
        'code',
        200,
      );
      console.log(`Checking if granular keys exist for todo 2`);
      // Check that granular keys exist for todo 2
      await expect(client.get(`${uniqueNamespace}:todos:2:id`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(client.get(`${uniqueNamespace}:todos:2:text`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(client.get(`${uniqueNamespace}:todos:2:completed`)).resolves.toHaveProperty(
        'code',
        200,
      );
      console.log(`Removing todo 1`);
      store1.getState().removeTodo('1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that granular keys for todo 1 are deleted
      await expect(client.get(`${uniqueNamespace}:todos:1:id`)).resolves.toHaveProperty(
        'code',
        404,
      );
      await expect(client.get(`${uniqueNamespace}:todos:1:text`)).resolves.toHaveProperty(
        'code',
        404,
      );
      await expect(client.get(`${uniqueNamespace}:todos:1:completed`)).resolves.toHaveProperty(
        'code',
        404,
      );
      // Check that granular keys for todo 2 still exist
      await expect(client.get(`${uniqueNamespace}:todos:2:id`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(client.get(`${uniqueNamespace}:todos:2:text`)).resolves.toHaveProperty(
        'code',
        200,
      );
      await expect(client.get(`${uniqueNamespace}:todos:2:completed`)).resolves.toHaveProperty(
        'code',
        200,
      );
    });

    it('should handle partial Record updates', async () => {
      const uniqueNamespace = createUniqueStoreName('record-partial-update-test');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      const todo = { id: '1', text: 'Original', completed: false };
      store1.getState().addTodo(todo);

      await new Promise(resolve => setTimeout(resolve, 100));

      store1.getState().updateTodo('1', { completed: true });

      await waitFor(() => {
        expect(store2.getState().todos['1'].completed).toBe(true);
        expect(store2.getState().todos['1'].text).toBe('Original');
      });
    });
  });

  describe('Array Type Support', () => {
    it('should synchronize array operations (add/remove items)', async () => {
      const uniqueNamespace = createUniqueStoreName('namespace');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().addItem('Task 1');
      store1.getState().addItem('Task 2');
      await waitFor(() => {
        expect(store2.getState().items.length).toBe(2);
        expect(store2.getState().items[0].name).toBe('Task 1');
        expect(store2.getState().items[1].name).toBe('Task 2');
      });

      const itemId = store2.getState().items[0].id;
      store2.getState().removeItem(itemId);
      await waitFor(() => {
        expect(store1.getState().items.length).toBe(1);
        expect(store1.getState().items[0].name).toBe('Task 2');
      });
    });
  });

  describe('Nested Object Updates', () => {
    it('should synchronize nested object updates', async () => {
      const uniqueNamespace = createUniqueStoreName('namespace');
      const store1 = createTestStore({ namespace: uniqueNamespace });
      const store2 = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Update theme in store 1
      store1.getState().updateTheme('dark');
      store2.getState().updateNotifications(false, 30);

      // Wait for synchronization
      await waitFor(() => {
        //expect(store1.getState().settings.theme).toBe('dark');
        expect(store1.getState().settings.notifications.enabled).toBe(false);
        expect(store1.getState().settings.notifications.frequency).toBe(30);
        //expect(store2.getState().settings.theme).toBe('dark');
        expect(store2.getState().settings.notifications.enabled).toBe(false);
        expect(store2.getState().settings.notifications.frequency).toBe(30);
      });
    });
  });
});
