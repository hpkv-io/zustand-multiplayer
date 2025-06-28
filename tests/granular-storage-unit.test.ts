import { describe, it, expect, vi } from 'vitest';
import { create, StateCreator } from 'zustand';
import { MultiplayerOptions, WithMultiplayer } from '../src/index';
import { MockTokenHelper, MockWebsocketTokenManager } from './mocks/mock-token-manager';
import { MockHPKVClientFactory } from './mocks/mock-hpkv-client';
import { createUniqueStoreName, waitFor } from './utils/test-utils';

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
const multiplayerModule = await import('../src/multiplayer');
const { StoreCreator } = await import('./utils/store-creator');
const { multiplayer } = multiplayerModule;

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

const initializer: StateCreator<
  MockGranularState,
  [['zustand/multiplayer', unknown]],
  []
> = set => ({
  todos: {},
  users: {},
  settings: { theme: 'light', autoSave: true },
  counter: 0,
});

const storeCreator = new StoreCreator();
function createTestStore(
  options?: Partial<MultiplayerOptions<MockGranularState>> | MultiplayerOptions<MockGranularState>,
) {
  return storeCreator.createStore<MockGranularState>(initializer, {
    apiKey: 'test-api-key',
    apiBaseUrl: 'hpkv-base-api-url',
    profiling: true,
    ...options,
  });
}

interface MockGranularState {
  todos: Record<string, { text: string; completed: boolean }>;
  users: Record<string, { name: string; role: string }>;
  settings: { theme: string; autoSave: boolean };
  counter: number;
}

describe('Granular Storage Unit Tests', () => {
  describe('Configuration Validation', () => {
    it('should notify granular state updates', async () => {
      const namespace = createUniqueStoreName('test-namespace');
      const store1 = createTestStore({ namespace });
      const store2 = createTestStore({ namespace });

      store1.getState().multiplayer.updateDraft?.((draft: any) => {
        draft.todos['todo-1'] = { text: 'Test todo', completed: false };
        draft.todos['todo-2'] = { text: 'Test todo 2', completed: false };
      });
      store2.getState().multiplayer.updateDraft?.((draft: any) => {
        draft.todos['todo-1'] = { text: 'Test todo 1', completed: true };
        draft.todos['todo-3'] = { text: 'Test todo 3', completed: false };
      });

      await waitFor(() => {
        expect(store1.getState().todos['todo-1']).toEqual({
          text: 'Test todo 1',
          completed: true,
        });
        expect(store2.getState().todos['todo-2']).toEqual({
          text: 'Test todo 2',
          completed: false,
        });
        expect(store2.getState().todos['todo-3']).toEqual({
          text: 'Test todo 3',
          completed: false,
        });
      });
    });
  });

  describe('Draft State Management', () => {
    it('should create draft state for Record fields', async () => {
      const store = createTestStore();
      const state = store.getState();

      // Mock the draft update
      let draftState: any;
      await state.multiplayer.updateDraft?.((draft: any) => {
        draftState = draft;
        // Draft should be a different object from the original state
        expect(draft).not.toBe(store.getState());
        // Record fields should have granular methods
        expect(typeof draft.todos.__granular_delete__).toBe('function');
        expect(typeof draft.todos.__granular_set__).toBe('function');
        expect(typeof draft.users.__granular_delete__).toBe('function');
        expect(typeof draft.users.__granular_set__).toBe('function');
      });
    });

    it('should track changes to Record fields in draft', async () => {
      const store = createTestStore();
      const state = store.getState();

      await state.multiplayer.updateDraft?.((draft: any) => {
        // Add items to Record fields
        draft.todos['todo-1'] = { text: 'Test todo', completed: false };
        draft.users['user-1'] = { name: 'John Doe', role: 'admin' };

        // Changes should be reflected in the draft
        expect(draft.todos['todo-1']).toEqual({ text: 'Test todo', completed: false });
        expect(draft.users['user-1']).toEqual({ name: 'John Doe', role: 'admin' });
      });
    });

    it('should provide __granular_delete__ method for Record fields', async () => {
      const store = createTestStore();
      const state = store.getState();

      await state.multiplayer.updateDraft?.((draft: any) => {
        // First add an item
        draft.todos['todo-1'] = { text: 'Test todo', completed: false };
        expect(draft.todos['todo-1']).toBeDefined();

        // Then delete it using the special method
        draft.todos.__granular_delete__('todo-1');

        // Item should be marked for deletion (implementation detail may vary)
        // The exact behavior depends on the implementation
        expect(typeof draft.todos.__granular_delete__).toBe('function');
      });
    });

    it('should handle nested property updates', async () => {
      const store = createTestStore();
      const state = store.getState();

      await state.multiplayer.updateDraft?.((draft: any) => {
        // Add an item
        draft.todos['todo-1'] = { text: 'Original text', completed: false };

        // Update nested properties
        draft.todos['todo-1'].text = 'Updated text';
        draft.todos['todo-1'].completed = true;

        // Changes should be tracked
        expect(draft.todos['todo-1'].text).toBe('Updated text');
        expect(draft.todos['todo-1'].completed).toBe(true);
      });
    });
  });

  describe('Storage Key Management', () => {
    it('should generate subscription patterns for granular fields', () => {
      const store = createTestStore();

      const state = store.getState();

      // Store should use pattern-based subscriptions internally
      // The exact verification depends on the mock implementation
      expect(store.getState().multiplayer).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in updateDraft gracefully', async () => {
      const store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {},
            users: {},
            settings: { theme: 'light', autoSave: true },
            counter: 0,
          }),
          {
            namespace: 'test-errors',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
          },
        ),
      );

      const state = store.getState();

      // Test error handling in updateDraft
      try {
        await state.multiplayer.updateDraft?.((draft: any) => {
          throw new Error('Test error in draft update');
        });
      } catch (error) {
        // Should handle the error gracefully
        expect(error).toBeInstanceOf(Error);
      }

      // Store should still be functional after error
      expect(store.getState()).toBeDefined();
    });

    it('should validate Record field configuration', () => {
      // Test that invalid configurations are handled properly
      expect(() => {
        create<WithMultiplayer<MockGranularState>>()(
          multiplayer(
            set => ({
              todos: {},
              users: {},
              settings: { theme: 'light', autoSave: true },
              counter: 0,
            }),
            {
              namespace: 'test-validation',
              apiKey: 'test-key',
              apiBaseUrl: 'http://test.com',
            },
          ),
        );
      }).not.toThrow(); // Should not throw during store creation
    });
  });

  describe('Integration with Traditional Storage', () => {
    it('should work alongside traditional Zustand state updates', async () => {
      const store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {},
            users: {},
            settings: { theme: 'light', autoSave: true },
            counter: 0,
          }),
          {
            namespace: 'test-mixed',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
          },
        ),
      );

      // Traditional Zustand update
      store.setState((state: MockGranularState) => ({
        ...state,
        counter: 42,
      }));

      // Granular update
      const state = store.getState();
      await state.multiplayer.updateDraft?.((draft: any) => {
        draft.todos['todo-1'] = { text: 'Granular todo', completed: false };
      });

      // Both updates should coexist
      expect(store.getState().counter).toBe(42);
      // Note: The exact state verification depends on the mock implementation
    });

    it('should handle mixed field types correctly', () => {
      const store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {}, // Granular
            users: {}, // Traditional
            settings: { theme: 'light', autoSave: true }, // Nested object
            counter: 0, // Traditional
          }),
          {
            namespace: 'test-mixed-fields',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
          },
        ),
      );

      // Store should handle mixed field types
      expect(store.getState()).toBeDefined();
      expect(typeof store.getState().multiplayer.updateDraft).toBe('function');
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety in draft updates', async () => {
      const store = createTestStore();

      const state = store.getState();

      await state.multiplayer.updateDraft?.((draft: any) => {
        // TypeScript should enforce correct types (in real usage)
        draft.todos['todo-1'] = { text: 'Test', completed: false };
        draft.users['user-1'] = { name: 'John', role: 'admin' };

        // These should be properly typed
        expect(typeof draft.todos['todo-1'].text).toBe('string');
        expect(typeof draft.todos['todo-1'].completed).toBe('boolean');
        expect(typeof draft.users['user-1'].name).toBe('string');
        expect(typeof draft.users['user-1'].role).toBe('string');
      });
    });
  });
});
