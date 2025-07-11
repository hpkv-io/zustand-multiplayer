# Zustand Multiplayer Next.js Starter

A collaborative Todo application built with Next.js, React, TypeScript, and Zustand Multiplayer Middleware. This example demonstrates how to create a real-time multiplayer application in a modern React framework where multiple users can manage todos together seamlessly.

## Features

- **Real-time Collaboration**: Multiple users can add, toggle, and delete todos simultaneously
- **Responsive Design**: Modern UI with CSS modules

## Prerequisites

- Node.js
- npm or yarn
- HPKV API credentials (get them from [hpkv.io](https://hpkv.io))

## Getting Started

### 1. Environment Setup

Create a `.env.local` file in the root directory:

```env
# HPKV Configuration
HPKV_API_KEY=your_hpkv_api_key_here
HPKV_API_BASE_URL=your_hpkv_api_base_url_here

# Public Environment Variables (accessible in browser)
NEXT_PUBLIC_HPKV_API_BASE_URL=your_hpkv_api_base_url_here
```

> **Note**: The `NEXT_PUBLIC_` prefix makes the API base URL accessible to client-side code while keeping the API key server-side only.

### 2. Installation

Install dependencies:
```bash
npm install
```

### 3. Running the Application

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

The application will be available at `http://localhost:3000`

## How It Works

### API Route - Token Generation

Next.js API routes provide a secure server-side endpoint for token generation:

```typescript
// src/pages/api/generate-token.ts
import { TokenHelper } from '@hpkv/zustand-multiplayer';

export default new TokenHelper(
  process.env.HPKV_API_KEY!, 
  process.env.HPKV_API_BASE_URL!
).createNextApiHandler();
```

This creates a `/api/generate-token` endpoint that generates authentication tokens securely.

### Store Setup with TypeScript

The Zustand store is configured with full TypeScript support and multiplayer middleware:

```typescript
// src/lib/store.ts
import { create } from 'zustand';
import { multiplayer, WithMultiplayer } from '@hpkv/zustand-multiplayer';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

interface TodoState {
  todos: Todo[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
}

export const useTodoStore = create<WithMultiplayer<TodoState>>()(
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
          todos: [...state.todos.filter((todo) => todo.id !== id)],
        })),
    }),
    {
      namespace: 'todo-store',
      tokenGenerationUrl: `/api/generate-token`,
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
    }
  )
);
```

#### Key Points:
- **TypeScript Integration**: `WithMultiplayer<TodoState>` provides type safety for multiplayer features
- **Environment Variables**: Uses Next.js environment variable conventions
- **API Route**: Points to the Next.js API route for token generation

### Component Architecture

#### Main App Component
```typescript
// src/components/TodoApp.tsx
const TodoApp: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  return (
    <div className={styles['todo-app']}>
      <h1>Collaborative ToDo App</h1>
      <ConnectionStatus />
      <div className={styles['todo-card']}>
        {/* Filter buttons */}
        <TodoList filter={filter} />
        <TodoInput />
      </div>
    </div>
  );
};
```

#### Using the Store in Components
```typescript
// src/components/TodoList.tsx
const TodoList: React.FC<TodoListProps> = ({ filter }) => {
  const todos = useTodoStore(state => state.todos);
  const toggleTodo = useTodoStore(state => state.toggleTodo);
  const removeTodo = useTodoStore(state => state.removeTodo);

  // Component logic...
};
```

#### Connection Status Monitoring
```typescript
// src/components/ConnectionStatus.tsx
const ConnectionStatus: React.FC = () => {
  const multiplayer = useTodoStore((state) => state.multiplayer);

  return (
    <div className={styles['connection-status']}>
      <div className={`${styles['status-indicator']} ${
        multiplayer.connectionState === ConnectionState.CONNECTED 
          ? styles['connected'] 
          : styles['disconnected']
      }`} />
      <span>{multiplayer.connectionState}</span>
    </div>
  );
};
```

## Testing Multiplayer Functionality

1. Start the development server: `npm run dev`
2. Open the application in multiple browser tabs or windows
3. Add, toggle, or delete todos in one tab
4. Watch as changes appear instantly in all other tabs
5. Monitor the connection status indicator for real-time feedback

## Project Structure

```
nextjs-starter/
├── src/
│   ├── components/           # React components
│   │   ├── TodoApp.tsx      # Main app component
│   │   ├── TodoList.tsx     # Todo list with filtering
│   │   ├── TodoInput.tsx    # Add new todo input
│   │   ├── ConnectionStatus.tsx # Connection status indicator
│   │   └── *.module.css     # Component-specific styles
│   ├── lib/
│   │   └── store.ts         # Zustand store with multiplayer
│   ├── pages/
│   │   ├── api/
│   │   │   └── generate-token.ts # Token generation API route
│   │   ├── index.tsx        # Home page
│   │   ├── _app.tsx         # Next.js app component
│   │   └── _document.tsx    # Custom document
│   └── styles/              # Global styles
├── package.json             # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── next.config.ts          # Next.js configuration
└── .env.local              # Environment variables
```

## Next Steps

- Explore the [main documentation](../../README.md) for advanced features
- Check out other examples in the repository