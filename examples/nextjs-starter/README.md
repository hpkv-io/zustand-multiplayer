# Zustand Multiplayer Todo App - Next.js Example

This is a simple collaborative Todo application that demonstrates the use of Zustand's multiplayer middleware for real-time state synchronization across multiple clients.

## Features

- Real-time collaborative todo list with shared state across clients
- Add, toggle, and remove todos with instant synchronization
- Connection status indicator showing real-time connection state

## How It Works

This example uses:

- **Next.js** for the React framework
- **Zustand** (v5.0.0) for state management
- **Zustand Multiplayer Middleware** for real-time state synchronization
- **HPKV WebSocket Client** (v1.2.3) for the underlying real-time communication

## Environment Variables

Before running the application, you need to set up the following environment variables:

```
# HPKV API credentials
HPKV_API_KEY=your-api-key-here
HPKV_API_BASE_URL=your_api_base_url

# Next.js public environment variables
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
NEXT_PUBLIC_HPKV_API_BASE_URL=your_api_base_url
```

You can create a `.env.local` file in the root directory by copying the `.env.example` file:

```bash
cp .env.example .env.local
```

Then update the values with your actual HPKV API credentials.

## Getting Started

1. Install the dependencies:

```bash
npm install
# or
yarn
# or
pnpm install
```

2. Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

3. Open [http://localhost:3000](http://localhost:3000) in multiple browser tabs to test the application.

## Structure

- `src/lib/store.ts` - Zustand store with multiplayer middleware
- `src/components/TodoApp.tsx` - Main Todo application component
- `src/components/TodoInput.tsx` - Component for adding new todos
- `src/components/TodoList.tsx` - Component for displaying and managing todos
- `src/components/ConnectionStatus.tsx` - Connection status indicator
- `src/pages/api/generate-token.ts` - API endpoint for generating tokens

## Detailed Implementation

### Setting up the Todo Store

The core of the application is in `src/lib/store.ts`, where we define our Todo state types and set up the Zustand store with the multiplayer middleware:

```typescript
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

// Create the store with multiplayer middleware
export const useTodoStore = create<StateWithMultiplayer<TodoState>>()(
  multiplayer(
    (set) => ({
      todos: [],
      
      // Add a new todo
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
        
      // Toggle a todo's completion status
      toggleTodo: (id: string) =>
        set((state: TodoState) => ({
          todos: state.todos.map((todo) =>
            todo.id === id
              ? { ...todo, completed: !todo.completed }
              : todo
          ),
        })),
        
      // Remove a todo
      removeTodo: (id: string) =>
        set((state: TodoState) => ({
          todos: state.todos.filter((todo) => todo.id !== id),
        })),
    }),
    {
 name: 'todo-store',
          tokenGenerationUrl: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate-token`,
          apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "",
    }
  )
);
```

### Using the Store in Components

Here's how you can use the store in your React components:

```tsx
// TodoList.tsx
import React from 'react';
import { useTodoStore } from '../lib/store';

interface TodoListProps {
  filter: 'all' | 'active' | 'completed';
}

const TodoList: React.FC<TodoListProps> = ({ filter }) => {
  const todos = useTodoStore(state => state.todos);
  const toggleTodo = useTodoStore(state => state.toggleTodo);
  const removeTodo = useTodoStore(state => state.removeTodo);

  // Filter todos based on the selected filter
  const filteredTodos = todos.filter(todo => {
    if (filter === 'all') return true;
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  return (
    <ul className="todo-list">
      {filteredTodos.map(todo => (
        <li key={todo.id} className={todo.completed ? 'completed' : ''}>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => toggleTodo(todo.id)}
          />
          <span>{todo.text}</span>
          <button onClick={() => removeTodo(todo.id)}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
};
```

### Connection Status Component

The ConnectionStatus component shows the real-time connection state:

```tsx
// ConnectionStatus.tsx
import React, { useEffect, useState } from 'react';
import { useTodoStore } from '../lib/store';

const ConnectionStatus: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const { multiplayer } = useTodoStore();

  useEffect(() => {
    // Check status immediately on mount
    if (multiplayer) {
      setIsConnected(multiplayer.isConnected());
    }

    // Setup polling to check connection status periodically
    const checkConnectionInterval = setInterval(() => {
      if (multiplayer) {
        setIsConnected(multiplayer.isConnected());
      }
    }, 1000);

    return () => clearInterval(checkConnectionInterval);
  }, [multiplayer]);

  return (
    <div className="connection-status">
      <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
      <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
    </div>
  );
};
```


## License

MIT
