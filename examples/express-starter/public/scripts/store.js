import { createStore } from 'https://esm.sh/zustand/vanilla';
import { multiplayer } from 'https://esm.sh/@hpkv/zustand-multiplayer';

// Ensure this path is correct based on how you structure your client-side JS for the Express app.
// If you are using a bundler, you might use environment variables differently.
// For a simple script tag in HTML, these would be global or configured elsewhere.
const HPKV_API_BASE_URL = window.HPKV_API_BASE_URL; // This needs to be set in the HTML or via a config script
const TOKEN_GENERATION_URL = '/api/hpkv-token'; // Relative to the Express server

/**
 * @typedef {object} Todo
 * @property {string} id
 * @property {string} text
 * @property {boolean} completed
 */

/**
 * @typedef {object} TodoState
 * @property {Todo[]} todos
 * @property {(text: string) => void} addTodo
 * @property {(id: string) => void} toggleTodo
 * @property {(id: string) => void} removeTodo
 * @property {object} multiplayer - Multiplayer API
 */

/**
 * @type {import('zustand').UseBoundStore<import('zustand').StoreApi<TodoState>>}
 */
export const useTodoStore = createStore()( // Note: No type assertion like <TodoState> in JS if not using JSDoc for complex types here
  multiplayer(
    (set) => ({
      todos: [],
      addTodo: (text) =>
        set((state) => ({
          todos: [
            ...state.todos,
            {
              id: Date.now().toString(),
              text,
              completed: false,
            },
          ],
        })),
      toggleTodo: (id) =>
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
          ),
        })),
      removeTodo: (id) =>
        set((state) => ({
          todos: state.todos.filter((todo) => todo.id !== id),
        })),
    }),
    {
      namespace: 'todo-express-store', // Unique namespace
      apiBaseUrl: HPKV_API_BASE_URL, // This will be read from window scope
      tokenGenerationUrl: TOKEN_GENERATION_URL,
      // publishUpdatesFor: () => ['todos'], // Example: only publish todos array changes
      // subscribeToUpdatesFor: () => ['todos'], // Example: only subscribe to todos array changes
    }
  )
);

// Expose to window for simple HTML script access if not using a bundler
// window.useTodoStore = useTodoStore; // Not needed if using ES modules correctly 