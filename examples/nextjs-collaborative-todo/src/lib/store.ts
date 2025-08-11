import type { WithMultiplayer } from '@hpkv/zustand-multiplayer';
import { multiplayer } from '@hpkv/zustand-multiplayer';
import { create } from 'zustand';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

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
        set((state) => {
          const id = Date.now().toString();
          return {
            ...state,
            todos: {
              ...state.todos,
              [id]: {
                id,
                text,
                completed: false,
              }
            }
          }
        }),
      toggleTodo: (id: string) =>
        set((state) => ({
          todos: {
            ...state.todos,
            [id]: {
              ...state.todos[id],
              completed: !state.todos[id].completed,
            },
          },
        })),
      removeTodo: (id: string) =>
        set((state) => ({
          todos: Object.fromEntries(
            Object.entries(state.todos).filter(([key]) => key !== id)
          ),
        })),
    }),
    {
      namespace: 'todo-store',
      tokenGenerationUrl: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate-token`,
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
    }
  )
);
