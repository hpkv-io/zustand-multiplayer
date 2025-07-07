import { create } from 'zustand';
import { LogLevel, multiplayer, WithMultiplayer } from '@hpkv/zustand-multiplayer';

// Define the Todo interface
interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

// Define the store state and actions
interface TodoState {
  todos: Record<string, Todo>;
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
}


export const useTodoStore = create<WithMultiplayer<TodoState>>()(
  multiplayer(
    set => ({
      todos: {},
      addTodo: (text: string) =>
        set(state => {
          state.todos[Date.now().toString()] = {
            id: Date.now().toString(),
            text,
            completed: false,
          };
        }),
      toggleTodo: (id: string) =>
        set(state => {
          state.todos[id].completed = !state.todos[id].completed;
        }),
      removeTodo: (id: string) =>
        set(state => {
          delete state.todos[id];
        }),
    }),
    {
      namespace: 'todo-store',
      tokenGenerationUrl: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate-token`,
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      logLevel: LogLevel.DEBUG,
    }
  )
);
