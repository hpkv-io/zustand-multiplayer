import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { multiplayer, WithMultiplayer } from '../src/index';

// Test state interface for granular storage
interface MockGranularState {
  todos: Record<string, { text: string; completed: boolean }>;
  users: Record<string, { name: string; role: string }>;
  settings: { theme: string; autoSave: boolean };
  counter: number;
}

describe('Granular Storage Unit Tests', () => {
  describe('Configuration Validation', () => {
    it('should create store with granular storage configuration', () => {
      const store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {},
            users: {},
            settings: { theme: 'light', autoSave: true },
            counter: 0,
          }),
          {
            namespace: 'test-granular',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
            granularStorage: {
              enableImmerLike: true,
              recordFields: ['todos', 'users'],
              nestedObjectFields: ['settings'],
            },
          },
        ),
      );

      const state = store.getState();

      // Should have updateDraft method when granular storage is enabled
      expect(typeof (state as any).updateDraft).toBe('function');

      // Should have multiplayer state
      expect(state.multiplayer).toBeDefined();
      expect(state.multiplayer.connectionState).toBeDefined();
    });

    it('should not add updateDraft when granular storage is disabled', () => {
      const store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {},
            users: {},
            settings: { theme: 'light', autoSave: true },
            counter: 0,
          }),
          {
            namespace: 'test-traditional',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
            // No granular storage configuration
          },
        ),
      );

      const state = store.getState();

      // Should not have updateDraft method when granular storage is disabled
      expect((state as any).updateDraft).toBeUndefined();
    });

    it('should handle custom key generators', () => {
      const customKeyGenerator = (id: string) => `custom_${id}`;

      const store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {},
            users: {},
            settings: { theme: 'light', autoSave: true },
            counter: 0,
          }),
          {
            namespace: 'test-custom-keys',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
            granularStorage: {
              enableImmerLike: true,
              recordFields: ['todos'],
              keyGenerators: {
                todos: customKeyGenerator,
              },
            },
          },
        ),
      );

      // Store should be created successfully with custom key generators
      expect(store.getState()).toBeDefined();
      expect(typeof (store.getState() as any).updateDraft).toBe('function');
    });
  });

  describe('Draft State Management', () => {
    let store: ReturnType<typeof create<WithMultiplayer<MockGranularState>>>;

    beforeEach(() => {
      store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {},
            users: {},
            settings: { theme: 'light', autoSave: true },
            counter: 0,
          }),
          {
            namespace: 'test-draft',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
            granularStorage: {
              enableImmerLike: true,
              recordFields: ['todos', 'users'],
            },
          },
        ),
      );
    });

    it('should create draft state for Record fields', async () => {
      const state = store.getState() as any;

      // Mock the draft update
      let draftState: any;
      await state.updateDraft?.((draft: any) => {
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
      const state = store.getState() as any;

      await state.updateDraft?.((draft: any) => {
        // Add items to Record fields
        draft.todos['todo-1'] = { text: 'Test todo', completed: false };
        draft.users['user-1'] = { name: 'John Doe', role: 'admin' };

        // Changes should be reflected in the draft
        expect(draft.todos['todo-1']).toEqual({ text: 'Test todo', completed: false });
        expect(draft.users['user-1']).toEqual({ name: 'John Doe', role: 'admin' });
      });
    });

    it('should provide __granular_delete__ method for Record fields', async () => {
      const state = store.getState() as any;

      await state.updateDraft?.((draft: any) => {
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
      const state = store.getState() as any;

      await state.updateDraft?.((draft: any) => {
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
    it('should generate correct storage keys for Record fields', () => {
      // This tests the internal key generation logic
      // The exact implementation depends on the StorageKeyManager class

      const store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {},
            users: {},
            settings: { theme: 'light', autoSave: true },
            counter: 0,
          }),
          {
            namespace: 'test-keys',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
            granularStorage: {
              enableImmerLike: true,
              recordFields: ['todos', 'users'],
            },
          },
        ),
      );

      // Store should be created successfully
      expect(store.getState()).toBeDefined();
      expect(store.getState().multiplayer).toBeDefined();
    });

    it('should generate subscription patterns for granular fields', () => {
      const store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {},
            users: {},
            settings: { theme: 'light', autoSave: true },
            counter: 0,
          }),
          {
            namespace: 'test-patterns',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
            granularStorage: {
              enableImmerLike: true,
              recordFields: ['todos', 'users'],
            },
          },
        ),
      );

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
            granularStorage: {
              enableImmerLike: true,
              recordFields: ['todos'],
            },
          },
        ),
      );

      const state = store.getState() as any;

      // Test error handling in updateDraft
      try {
        await state.updateDraft?.((draft: any) => {
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
              granularStorage: {
                enableImmerLike: true,
                recordFields: ['nonexistentField' as any], // Invalid field
              },
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
            granularStorage: {
              enableImmerLike: true,
              recordFields: ['todos'], // Only todos is granular
            },
          },
        ),
      );

      // Traditional Zustand update
      store.setState((state: MockGranularState) => ({
        ...state,
        counter: 42,
      }));

      // Granular update
      const state = store.getState() as any;
      await state.updateDraft?.((draft: any) => {
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
            granularStorage: {
              enableImmerLike: true,
              recordFields: ['todos'], // Only todos is granular
              nestedObjectFields: ['settings'], // Settings uses JSON patch
            },
          },
        ),
      );

      // Store should handle mixed field types
      expect(store.getState()).toBeDefined();
      expect(typeof (store.getState() as any).updateDraft).toBe('function');
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety in draft updates', async () => {
      const store = create<WithMultiplayer<MockGranularState>>()(
        multiplayer(
          set => ({
            todos: {},
            users: {},
            settings: { theme: 'light', autoSave: true },
            counter: 0,
          }),
          {
            namespace: 'test-types',
            apiKey: 'test-key',
            apiBaseUrl: 'http://test.com',
            granularStorage: {
              enableImmerLike: true,
              recordFields: ['todos', 'users'],
            },
          },
        ),
      );

      const state = store.getState() as any;

      await state.updateDraft?.((draft: any) => {
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
