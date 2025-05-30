import { create } from 'zustand';
import { multiplayer } from '@hpkv/zustand-multiplayer';

// Define the Todo interface
interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

// Define the store state and actions
interface TodoState {
  todos: Todo[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
}


export const useTodoStore = create<TodoState>()(
  multiplayer(
    set => ({
      todos: [],
          addTodo: (text: string) => 
            set((state: TodoState) => ({
              todos: [
                ...state.todos,
                {
                  id: Date.now().toString(),
                  text,
                  completed: false,
                },
              ],
            })),
          toggleTodo: (id: string) =>
            set((state: TodoState) => ({
              todos: state.todos.map((todo) =>
                todo.id === id
                  ? { ...todo, completed: !todo.completed }
                  : todo
              ),
            })),
          removeTodo: (id: string) =>
            set((state: TodoState) => ({
              todos: state.todos.filter((todo) => todo.id !== id),
            })),
        }),
        {
          namespace: 'todo-store',
          tokenGenerationUrl: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate-token`,
          apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL || "",
        }
      )
    );
