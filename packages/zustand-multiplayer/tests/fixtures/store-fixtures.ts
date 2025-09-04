import type { StateCreator } from 'zustand';

export interface TestState {
  counter: number;
  title: string;
  nested: {
    value: number;
    nested2: {
      value: number;
      nested3: {
        value: number;
        nested4: {
          value: number;
        };
      };
    };
  };
  todos: Record<string, { id: string; title: string; completed: boolean }>;
  increment: () => void;
  decrement: () => void;
  setTitle: (text: string) => void;
  updateNested: (value: number) => void;
  updateNested2: (value: number) => void;
  updateNested3: (value: number) => void;
  updateNested4: (value: number) => void;
  addTodo: (title: string) => void;
  removeTodo: (title: string) => void;
  updateTodoTitle: (id: string, newTitle: string) => void;
}

export const createTestStateInitializer = (): StateCreator<TestState, [], []> => set => ({
  counter: 0,
  title: '',
  nested: { value: 0, nested2: { value: 0, nested3: { value: 0, nested4: { value: 0 } } } },
  todos: {},
  increment: () => set(state => ({ counter: state.counter + 1 })),
  decrement: () => set(state => ({ counter: state.counter - 1 })),
  setTitle: (text: string) => set({ title: text }),
  updateNested: (value: number) => set(state => ({ nested: { ...state.nested, value } })),
  updateNested2: (value: number) =>
    set(state => ({
      nested: {
        ...state.nested,
        nested2: { ...state.nested.nested2, value },
      },
    })),
  updateNested3: (value: number) =>
    set(state => ({
      nested: {
        ...state.nested,
        nested2: {
          ...state.nested.nested2,
          nested3: { ...state.nested.nested2.nested3, value },
        },
      },
    })),
  updateNested4: (value: number) =>
    set(state => ({
      nested: {
        ...state.nested,
        nested2: {
          ...state.nested.nested2,
          nested3: { ...state.nested.nested2.nested3, nested4: { value } },
        },
      },
    })),
  addTodo: (title: string) =>
    set(state => ({
      todos: {
        ...state.todos,
        [title]: { id: title, title, completed: false },
      },
    })),
  updateTodoTitle: (id: string, newTitle: string) =>
    set(state => ({
      todos: {
        ...state.todos,
        [id]: { ...state.todos[id], title: newTitle },
      },
    })),
  removeTodo: (title: string) =>
    set(state => {
      const { [title]: _, ...rest } = state.todos;
      return { todos: rest };
    }),
});
