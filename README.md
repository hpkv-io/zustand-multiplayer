# Zustand Multiplayer Middleware

[![npm version](https://img.shields.io/npm/v/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)
[![npm downloads](https://img.shields.io/npm/dm/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![HPKV logo](assets/images/logo.png)

**Real-time state synchronization for Zustand stores.** Build collaborative applications with automatic state sharing across multiple clients. The `multiplayer` middleware brings **state persistence** and **real-time synchronization** to Zustand stores, making it easy to build multiplayer applications with just a few lines of code.



## What is Zustand Multiplayer?

Zustand Multiplayer is a powerful middleware that transforms any Zustand store into a real-time collaborative state management system. Convert your existing Zustand stores to multiplayer stores in just a few steps with minimal code changes.

### ✨ **Key Features**

- **🔄 Real-time Synchronization** - Automatic state sharing across all connected clients using WebSockets
- **💾 Persistent Storage** - All state changes are automatically stored in HPKV for durability and offline support
- **🎯 Selective Sync** - Choose which parts of your state to share vs keep local using field-level controls
- **🔧 Granular Storage** - Store individual items in Record fields for conflict-free collaboration (configurable depth)
- **⚡ Performance Optimized** - Efficient change detection, minimal network traffic, and smart caching
- **🔌 TypeScript Ready** - Full type safety with proper TypeScript integration and IntelliSense support
- **🛡️ Conflict Resolution** - Built-in conflict handling with customizable resolution strategies
- **📊 Monitoring & Debugging** - Comprehensive performance metrics and connection status monitoring
- **🔐 Secure Authentication** - Token-based authentication with server-side validation


### 🎯 **Usage Examples**

- **Collaborative Apps** - Real-time document editing, live polls, shared whiteboards, collaborative forms
- **Multiplayer Games** - Shared game state, player positions, scores, real-time leaderboards
- **Team Dashboards** - Live metrics, shared settings, real-time notifications, collaborative workspaces
- **Social Features** - Live comments, shared preferences, collaborative lists, group activities
- **E-commerce** - Shared shopping carts, live inventory updates, collaborative wishlists
- **IoT Applications** - Real-time sensor data, device control, shared dashboards

## Installation

```bash
npm install @hpkv/zustand-multiplayer zustand
```

### Peer Dependencies

- **zustand** ^5.0.3 - The core state management library
- **@hpkv/websocket-client** - WebSocket client for real-time communication (installed automatically)
- **immer** - Immutable state updates (installed automatically)

## Prerequisites

1. **Sign up at [hpkv.io](https://hpkv.io/signup)** - Create your free account
2. **Get your API credentials** from the [dashboard](https://hpkv.io/dashboard/api-keys):
   - **API Key** - For server-side authentication
   - **Base URL** - Your HPKV API endpoint
3. **Choose your authentication method**:
   - **Client-side**: Set up a token generation endpoint (recommended for web apps)
   - **Server-side**: Use API key directly (for Node.js servers)


## Quick Start

### 1. Create a Collaborative Todo Store

```typescript
// store.ts
import { create } from 'zustand';
import { multiplayer, WithMultiplayer } from '@hpkv/zustand-multiplayer';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

interface TodoState {
  todos: Record<string, Todo>;
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
}

export const useTodoStore = create<WithMultiplayer<TodoState>>()(
  multiplayer(
    (set) => ({
      todos: {},
      
      // Using Immer-style mutations for clean updates
      addTodo: (text: string) => set((state) => {
        const id = Date.now().toString();
        state.todos[id] = {
          id,
          text,
          completed: false,
          createdAt: Date.now(),
        };
      }),
      
      toggleTodo: (id: string) => set((state) => {
        if (state.todos[id]) {
          state.todos[id].completed = !state.todos[id].completed;
        }
      }),
      
      removeTodo: (id: string) => set((state) => {
        delete state.todos[id];
      }),
    }),
    {
      namespace: 'collaborative-todos',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
      // zFactor: 1 is default - stores todos object as one key
    }
  )
);
```

### 2. Setup Token Generation Endpoint

#### Express.js Example

```typescript
// pages/api/generate-token.ts (Next.js) or server.js (Express)
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY!,
  process.env.HPKV_API_BASE_URL!
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Add your authentication logic here
    // const user = await authenticateUser(req.headers.authorization);
    // if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Generate token using the built-in handler
    const response = await tokenHelper.processTokenRequest(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.error('Token generation failed:', error);
    res.status(500).json({ error: 'Token generation failed' });
  }
}
```

#### Express with Authentication

```typescript
// server.js
import express from 'express';
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const app = express();
app.use(express.json());

const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY!,
  process.env.HPKV_API_BASE_URL!
);

app.post('/api/generate-token', async (req, res) => {
  try {
    // Authentication middleware
    const user = await authenticateUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check namespace permissions
    const { namespace } = req.body;
    if (!user.canAccess(namespace)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Use built-in Express handler
    const handler = tokenHelper.createExpressHandler();
    return handler(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

> 📖 **See [Token API Guide](./docs/TOKEN_API.md)** for more details on the details and implementations in Express, Next.js, Fastify, and other frameworks.

### 3. Use in Your React App

```tsx
// components/TodoApp.tsx
import React, { useState } from 'react';
import { ConnectionState } from '@hpkv/websocket-client';
import { useTodoStore } from './store';

function TodoApp() {
  const [newTodo, setNewTodo] = useState('');
  const { todos, addTodo, toggleTodo, removeTodo, multiplayer } = useTodoStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTodo.trim()) {
      addTodo(newTodo.trim());
      setNewTodo('');
    }
  };

  const todoList = Object.values(todos).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="todo-app">
      <div className="connection-status">
        Status: {multiplayer.connectionState === ConnectionState.CONNECTED ? '🟢 Connected' : '🔴 Disconnected'}
      </div>
      
      <h1>Collaborative Todo List</h1>
      
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a new todo..."
        />
        <button type="submit">Add</button>
      </form>

      <ul className="todo-list">
        {todoList.map((todo) => (
          <li key={todo.id} className={todo.completed ? 'completed' : ''}>
            <label>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id)}
              />
              <span>{todo.text}</span>
            </label>
            <button onClick={() => removeTodo(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>
      
      <p>✨ Changes sync in real-time across all connected users!</p>
    </div>
  );
}

export default TodoApp;
```

### 4. Environment Configuration

```bash
# .env.local (Next.js) or .env (Node.js)
HPKV_API_KEY=your_api_key_here
HPKV_API_BASE_URL=https://api.hpkv.io

# For client-side (Next.js public variables)
NEXT_PUBLIC_HPKV_API_BASE_URL=https://api.hpkv.io
```

**🎉 That's it!** Your collaborative todo app is now ready with real-time synchronization!

## Implementation Patterns

### Pattern 1: Simple Live Poll

Perfect for voting systems, surveys, or real-time counters:

```typescript
interface PollState {
  votes: Record<string, number>;
  vote: (option: string) => void;
}

const usePollStore = create<WithMultiplayer<PollState>>()(
  multiplayer(
    (set) => ({
      votes: {},
      vote: (option: string) => set((state) => {
        state.votes[option] = (state.votes[option] || 0) + 1;
      }),
    }),
    {
      namespace: 'live-poll',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
    }
  )
);
```

### Pattern 2: Selective Sync (Mixed Local/Shared State)

Keep some data local while sharing others:

```typescript
interface AppState {
  // Shared across all users
  globalSettings: { theme: string; language: string };
  sharedCounter: number;
  
  // Local to each user
  userPreferences: { notifications: boolean; sidebar: boolean };
  draftInput: string;
  
  // Actions
  updateGlobalSettings: (settings: Partial<AppState['globalSettings']>) => void;
  incrementCounter: () => void;
  setUserPreference: (key: string, value: boolean) => void;
}

const useAppStore = create<WithMultiplayer<AppState>>()(
  multiplayer(
    (set) => ({
      globalSettings: { theme: 'light', language: 'en' },
      sharedCounter: 0,
      userPreferences: { notifications: true, sidebar: true },
      draftInput: '',
      
      updateGlobalSettings: (settings) => set((state) => {
        Object.assign(state.globalSettings, settings);
      }),
      
      incrementCounter: () => set((state) => {
        state.sharedCounter += 1;
      }),
      
      setUserPreference: (key, value) => set((state) => {
        state.userPreferences[key] = value;
      }),
    }),
    {
      namespace: 'mixed-sync-app',
      // Only sync shared data
      publishUpdatesFor: () => ['globalSettings', 'sharedCounter'],
      subscribeToUpdatesFor: () => ['globalSettings', 'sharedCounter'],
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
    }
  )
);
```

### Pattern 3: Server-Side Store

For background workers, cron jobs, or server-side logic:

```javascript
// server-store.js
import { createStore } from 'zustand/vanilla';
import { multiplayer } from '@hpkv/zustand-multiplayer';

const serverStore = createStore(
  multiplayer(
    (set) => ({
      systemMetrics: {},
      notifications: {},
      
      updateMetrics: (metrics) => set((state) => {
        Object.assign(state.systemMetrics, metrics);
      }),
      
      broadcastNotification: (message) => set((state) => {
        const id = Date.now().toString();
        state.notifications[id] = {
          id,
          message,
          timestamp: Date.now(),
          read: false,
        };
      }),
    }),
    {
      namespace: 'system-alerts',
      apiBaseUrl: process.env.HPKV_API_BASE_URL,
      apiKey: process.env.HPKV_API_KEY, // Direct API key for server
    }
  )
);

// Use in background job
setInterval(() => {
  const metrics = collectSystemMetrics();
  serverStore.getState().updateMetrics(metrics);
}, 30000);
```

## Multiplayer State

Every store created with the multiplayer middleware provides a `multiplayer` object with state and methods for managing the connection and synchronization:

```javascript
// You can access the multiplayer state to use multiplayer API and states
const multiplayer = usePollStore((state) => state.multiplayer);

// Connection state (reactive)
console.log(multiplayer.connectionState); // 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'RECONNECTING'

// Manual control methods
multiplayer.hydrate();        // Refresh from server
multiplayer.clearStorage();   // Clear local data
multiplayer.connect();        // Establish connection
multiplayer.disconnect();     // Close connection
multiplayer.destroy();        // Cleanup resources

// Status and metrics
const status = multiplayer.getConnectionStatus();
const metrics = multiplayer.getMetrics();
```

**Available State:**
- `connectionState` - Reactive connection state (`CONNECTED`, `DISCONNECTED`, `CONNECTING`, `RECONNECTING`)
- `hasHydrated` - Whether the store has loaded initial state from server

**Available Methods:**
- `hydrate()` - Manually sync with server state
- `clearStorage()` - Clear all local stored data
- `connect()` - Establish connection
- `disconnect()` - Close connection
- `getConnectionStatus()` - Get detailed connection statistics
- `getMetrics()` - Get performance statistics (sync times, operation counts)
- `destroy()` - Destroy the store and cleanup resources


## Advanced Features

### 🎯 Selective Synchronization

By default, every change to your state is synced with all connected clients. However, you have control over which parts of your state are shared and which remain local. The *multiplayer* middleware lets you specify exactly which state fields should be broadcast to others and which updates your store should listen for from other clients.

This can be managed using `publishUpdatesFor` and `subscribeToUpdatesFor` options.

**Why use selective sync?**
- Keep sensitive data local (user preferences, drafts)
- Share only collaborative data (shared settings, public content)
- Reduce network traffic by syncing only what's needed
- Avoiding unnecessary sync to improve performance

```javascript
export const useAppStore = create(
  multiplayer(
    (set) => ({
      // Shared across all users
      sharedSettings: { teamSettings: {}, defaultLanguage: 'en' },
      // Local to each user
      userPreferences: { theme: '' },
      // Actions...
    }),
    {
      namespace: 'my-app',
      // Only sync changes to shared settings with remote
      publishUpdatesFor: () => ['sharedSettings'],
      // Only receive updates for shared settings from other clients
      subscribeToUpdatesFor: () => ['sharedSettings'],
    })
);
```

**Result:**
- ✅ `sharedSettings` - synchronized across all users - will be persisted/synced
- ✅ `userPreferences` - local to each user - Won't be persisted/synced

### 🔧 Granular Storage - Reduce Conflicts in Collaborative Apps

Multiplayer uses a granular storage scheme that defines how nested state is stored and synchronized. Instead of treating entire objects as single units, it breaks down nested structures into individual storage keys, avoiding unnecessary conflicts for collaborative editing.

The `zFactor` option controls the depth level for granular storage, allowing you to optimize performance based on your data structure:

- **zFactor: 0**: Store entire state in a single key - Best for atomic state updates
- **zFactor: 1**: Each top-level property gets its own key (default) - Good balance
- **zFactor: 2**: Properties at depth 2 get their own keys - For nested objects
- **zFactor: 3-10**: Deeper granularity - For deeply nested collaborative data

**Choosing the Right zFactor:**
- **Use zFactor: 0** when the entire state should update atomically (e.g., form submissions, atomic transactions)
- **Use zFactor: 1** (default) for most applications - provides good balance between granularity and performance
- **Use higher zFactor (2+)** when properties change independently (e.g., individual todo items in a nested structure that different users might edit)
- Consider your collaboration patterns: If multiple users edit different parts of deeply nested objects simultaneously, use a higher zFactor to minimize conflicts

`multiplayer` allows [immer style](https://immerjs.github.io/immer/) state updates to conveniently changing only part of the state which is intended to be changed.

```javascript
 multiplayer(
    (set) => ({
      todos: {},
      addTodo: (id, text) => set((state) => {
        state.todos[id] = {id, text, completed:false}
      }),
      toggleTodo:(id) => set((state) => {
        state.todos[id].completed = !state.todos[id].completed
      }),
    }),
    {
      //options...
    })
```

#### Storage Example

For this example state:
```javascript
{
  "user": {
    "profile": {
      "name": "John",
      "email": "john@example.com"
    },
    "preferences": {
      "theme": "dark"
    }
  },
  "todos": {
    "1": {
      "id": "1",
      "text": "Buy milk",
      "completed": false
    },
    "2": {
      "id": "2", 
      "text": "Walk dog",
      "completed": true
    }
  }
}
```


**With `zFactor: 0`** (top-level properties):
```
namespace:user -> { "profile": {...}, "preferences": {...} }
namespace:todos -> { "1": {...}, "2": {...} }
```

**With `zFactor: 1`** (properties at depth 2):
```
namespace:user:profile -> { "name": "John", "email": "john@example.com" }
namespace:user:preferences -> { "theme": "dark" }
namespace:todos:1 -> { "id": "1", "text": "Buy milk", "completed": false }
namespace:todos:2 -> { "id": "2", "text": "Walk dog", "completed": true }
```

**With `zFactor: 2`** (default - properties at depth 3):
```
namespace:user:profile:name -> "John"
namespace:user:profile:email -> "john@example.com"  
namespace:user:preferences:theme -> "dark"
namespace:todos:1:id -> "1"
namespace:todos:1:text -> "Buy milk"
namespace:todos:1:completed -> false
namespace:todos:2:id -> "2"
namespace:todos:2:text -> "Walk dog"
namespace:todos:2:completed -> true
```

Each nested property gets its own storage key, allowing the middleware to:
- **Track changes at depth** - Sync only the specific nested properties that changed
- **Reduce conflicts** - Multiple users can edit different nested properties simultaneously
- **Optimize performance** - Choose the right granularity level for your data structure


> **📝 Records vs Arrays for Collections:**
> multiplayer treats records as objects so each record entry will be stored in a separate key-value entry in the database, however arrays are treated as primitive types and array members will not be stored in separate key-value entries.
>Therefore when dealing with collection of objects that are going to be updated concurrently by multiple users, best is to use records instead of arrays.


### 🛡️ Offline Conflict Resolution

When a client goes offline and comes back online, it may have missed updates from other clients. The conflict resolution system handles reconciling local pending changes with the current server state:

```javascript
const useSharedContentStore = create(
  multiplayer(
    (set) => ({
      content: '',
      setContent: (content) => set((state) => state.content = state.content + content),
    }),
    {
      namespace: 'shared-document',      
      onConflict: (conflicts) => {       
        const contentConflict = conflicts.find(c => c.field === 'content');
        if (contentConflict) {
          const localChange = contentConflict.pendingValue;
          const remoteContent = contentConflict.remoteValue;
          return {
            strategy: 'merge',
            mergedValues: {
              content: mergeDocumentContent(localChange, remoteContent),
            }
          };
        }
        // For other fields, prefer remote (server) version
        return { strategy: 'keep-remote' };
      },
      // rest of the options...
    }
  )
);

function mergeDocumentContent(localContent, remoteContent) {
  // Your merge logic here
}
```

**When conflicts occur:**
1. **Client goes offline** - continues making local changes
2. **Other clients make changes** - updates are synced to server
3. **Client comes back online** - detects conflicts between local pending changes and current server state
4. **Conflict resolution triggers** - your `onConflict` handler decides how to merge

**Available strategies:**
- `keep-remote`: Use the server state (default - safe choice)
- `keep-local`: Use your local changes (may overwrite others' work)
- `merge`: Custom merge with `mergedValues` (merge the changes with the existing ones)

### 📊 Monitoring and Debugging

The middleware provides comprehensive monitoring and debugging capabilities:

```typescript
// Real-time connection monitoring component
function ConnectionMonitor() {
  const { multiplayer } = useMyStore();
  const [status, setStatus] = useState(multiplayer.getConnectionStatus());
  const [metrics, setMetrics] = useState(multiplayer.getMetrics());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(multiplayer.getConnectionStatus());
      setMetrics(multiplayer.getMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, [multiplayer]);

  return (
    <div className="connection-monitor">
      <h3>Connection Status</h3>
      <div>
        <span className={status?.isConnected ? 'connected' : 'disconnected'}>
          {status?.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
        <span>State: {multiplayer.connectionState}</span>
      </div>
      
      <div>Reconnect attempts: {status?.reconnectAttempts}</div>
      <div>Pending messages: {status?.messagesPending}</div>
      
      {status?.throttling && (
        <div>
          Throttling: {status.throttling.currentRate}/s 
          (Queue: {status.throttling.queueLength})
        </div>
      )}

      <h3>Performance Metrics</h3>
      <div>State changes: {metrics.stateChangesProcessed}</div>
      <div>Avg sync time: {metrics.averageSyncTime.toFixed(1)}ms</div>
      <div>Avg hydration: {metrics.averageHydrationTime.toFixed(1)}ms</div>
      
      <button onClick={() => multiplayer.hydrate()}>
        Force Refresh
      </button>
    </div>
  );
}
```

### 🛡️ Error Handling

Handle errors gracefully with proper error catching:

```typescript
import { 
  MultiplayerError, 
  TokenGenerationError, 
  HydrationError,
  ConfigurationError 
} from '@hpkv/zustand-multiplayer';

function ErrorBoundaryComponent() {
  const { multiplayer } = useMyStore();
  const [error, setError] = useState<string | null>(null);

  const handleHydrate = async () => {
    try {
      setError(null);
      await multiplayer.hydrate();
    } catch (err) {
      if (err instanceof HydrationError) {
        setError(`Sync failed: ${err.message}`);
        console.error('Hydration error details:', err.toSerializable());
      } else if (err instanceof TokenGenerationError) {
        setError('Authentication failed. Please refresh.');
      } else {
        setError('An unexpected error occurred.');
      }
    }
  };

  const handleClearStorage = async () => {
    if (confirm('This will clear all data. Continue?')) {
      try {
        await multiplayer.clearStorage();
        setError(null);
      } catch (err) {
        setError('Failed to clear storage.');
      }
    }
  };

  return (
    <div className="error-boundary">
      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      
      <div className="admin-controls">
        <button onClick={handleHydrate}>Refresh Data</button>
        <button onClick={handleClearStorage}>Clear All Data</button>
        <button onClick={() => multiplayer.disconnect()}>Disconnect</button>
        <button onClick={() => multiplayer.connect()}>Reconnect</button>
      </div>
    </div>
  );
}
```

### 🎮 Manual Control

Multiplayer will automatically connect and hydrate the state from database, However you can also take control when needed:

```javascript
// components/AdminControls.js
function AdminControls() {
  const { multiplayer } = useMyStore();

  return (
    <div>
      <button onClick={() => multiplayer.hydrate()}>
        Refresh from Server
      </button>
      <button onClick={() => multiplayer.clearStorage()}>
        Clear All Data
      </button>
      <button onClick={() => multiplayer.disconnect()}>
        Disconnect
      </button>
      <button onClick={() => multiplayer.connect()}>
        Reconnect
      </button>
    </div>
  );
}
```
### Connection Monitoring

Track connection health using reactive state:

```javascript
import { useMyStore } from './store';
import { ConnectionState } from '@hpkv/websocket-client';
function ConnectionMonitor() {
  const  {connectionState}  = useMyStore((state) => state.multiplayer);
  return (
    <div>
      <p>Connected: {connectionState === ConnectionState.CONNECTED ? 'Yes' : 'No'}</p>
    </div>
  );
}
```

## TypeScript Support

Always use `WithMultiplayer<T>` wrapper for proper typing:

```typescript
import { create } from 'zustand';
import { multiplayer, WithMultiplayer } from '@hpkv/zustand-multiplayer';


interface TodoState {
    todos: Record<string, {id: string, text: string, completed: boolean}>;
    addTodo: (text: string) => void;
    toggleTodo: (id: string) => void;
  }
  
  export const useTodoStore = create<WithMultiplayer<TodoState>>()(
    multiplayer((set) => ({
        todos: {},
        addTodo: (text: string) => set((state: TodoState) => {
            const id = Date.now().toString();
            state.todos[id] = {id, text, completed: false};
        }),
        toggleTodo: (id: string) => set((state: TodoState) => {
            state.todos[id].completed = !state.todos[id].completed;
        }),
    }),
    {
        namespace: 'todos',
        apiBaseUrl: 'YOUR_HPKV_BASE_URL',
        tokenGenerationUrl: 'http://localhost:3000/api/generate-token',
    })
  );
```

## Using without React

For non-react usage, instead of Zustand's `create`, use `createStore` from vanilla Zustand

### Using Vanilla JavaScript

```javascript
import { createStore } from 'zustand/vanilla';
import { multiplayer } from '@hpkv/zustand-multiplayer';

// Create store without React hooks
const gameStore = createStore(
  multiplayer(
    (set) => ({
      players: {},
      gameState: 'waiting',
      addPlayer: (id, name) => set((state) => {
        state.players[id] = { name, score: 0 };
      }),
      updateScore: (playerId, score) => set((state) => {
        state.players[playerId].score = score;
      }),
      startGame: () => set((state) => {
        state.gameState = 'playing';
      }),
    }),
    {
      namespace: 'multiplayer-game',
      apiBaseUrl: 'Your_HPKV_API_Base_URL',
      apiKey: 'Your_HPKV_API-Key', // Server-side only
    }
  )
);

gameStore.getState().addPlayer('player1', 'Alice');
gameStore.getState().addPlayer('player2', 'Bob');
gameStore.getState().startGame();

// Subscribe to changes
gameStore.subscribe((state) => {
  console.log('Game state updated:', state);
  updateGameUI(state);
});
```

### Using in Server-Side NodeJS

Server-side stores can use your API key directly for authentication (no token generation endpoint needed). When client and server stores share the same namespace, they automatically synchronize state in real-time:

```javascript
// server-store.js
import { createStore } from 'zustand/vanilla';
import { multiplayer } from '@hpkv/zustand-multiplayer';

const serverStore = createStore(
  multiplayer(
    (set) => ({
      notifications: {},
      addNotification: (message) => set((state) => {
        state.notifications[message.id] = message;
      }),
    }),
    {
      namespace: 'live-notiictions',
      apiBaseUrl: 'Your_HPKV_API_Base_URL',
      apiKey: 'Your_HPKV_API-Key',
    })
);
```

```javascript
// client-store.js
export const useAppStore = create()(
  multiplayer(
    (set) => ({
      notifications: {},
    }),
    {
      namespace: 'live-notifications', // Same namespace = shared state
      apiBaseUrl: 'Your_HPKV_API_Base_URL',
      tokenGenerationUrl: '/api/generate-token',
    })
);
```

## Core Concepts

### Namespaces

Each store has a unique `namespace` that:
- **Identifies** your data in HPKV (keys are prefixed with `namespace:`)
- **Enables collaboration** - stores with the same namespace share data
- **Provides isolation** - different namespaces don't interfere with each other

### Authentication

- **Client-side**: Use `tokenGenerationUrl` pointing to your secure backend endpoint
- **Server-side**: Use `apiKey` directly (never expose in client code)

### State Persistence

All published state changes are automatically:
- **Persisted** to HPKV for durability
- **Synchronized** across all connected clients in real-time

## Configuration

### Basic Options

```typescript
{
  namespace: 'my-app',                    // Required: unique identifier
  apiBaseUrl: 'hpkv-api-base-url',     // Required: your HPKV base URL
  tokenGenerationUrl: '/api/token',       // Required for client-side
  apiKey: 'your-api-key',                // Required for server-side
}
```

### Advanced Options

```typescript
{
  // Selective sync
  publishUpdatesFor: () => ['field1', 'field2'],
  subscribeToUpdatesFor: () => ['field1', 'field3'],
  
  // Storage granularity
  zFactor: 4, // Controls depth level for granular storage (0-10, default: 2)
  
  // Lifecycle hooks
  onHydrate: (state) => console.log('Hydrated:', state),
  onConflict: (conflicts) => ({ strategy: 'keep-remote' }),
  
  // Performance & debugging
  logLevel: LogLevel.INFO,
  profiling: true,
  retryConfig: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
  },
  
  // Websocket connection tuning
  clientConfig: {
    maxReconnectAttempts: 10,
    throttling: { enabled: true, rateLimit: 10 }
  }
}
```

## Troubleshooting

### Common Issues

#### 🔗 Connection Problems

**Problem**: Store not connecting or frequent disconnections
```typescript
// Check connection status
const { multiplayer } = useMyStore();
console.log('Connection state:', multiplayer.connectionState);
console.log('Status:', multiplayer.getConnectionStatus());
```

**Solutions**:
- Verify your `apiBaseUrl` and token endpoint are correct
- Check network connectivity and firewall settings
- Ensure your token generation endpoint is accessible
- Review server logs for authentication errors

#### 🔑 Authentication Errors

**Problem**: `TokenGenerationError` or 401/403 responses
```typescript
// Debug token generation
try {
  const response = await fetch('/api/generate-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      namespace: 'your-namespace',
      subscribedKeys: ['field1', 'field2']
    })
  });
  console.log('Token response:', await response.json());
} catch (error) {
  console.error('Token generation failed:', error);
}
```

**Solutions**:
- Verify your HPKV API key is correct and not expired
- Check that your token endpoint implements proper authentication
- Ensure environment variables are loaded correctly
- Validate the token request/response format

#### ⚡ Performance Issues

**Problem**: Slow synchronization or high memory usage
```typescript
// Enable profiling and monitor metrics
const useMyStore = create<WithMultiplayer<MyState>>()(
  multiplayer(
    // ... your state
    {
      namespace: 'my-app',
      profiling: true, // Enable detailed metrics
      logLevel: LogLevel.DEBUG, // Enable debug logging
      zFactor: 1, // Reduce granularity if needed
    }
  )
);

// Monitor performance
const metrics = multiplayer.getMetrics();
console.log('Performance:', metrics);
```

**Solutions**:
- Adjust `zFactor` based on your data structure
- Use selective sync to reduce network traffic
- Implement proper error boundaries
- Monitor and optimize your state structure

#### 🔄 State Sync Issues

**Problem**: Changes not syncing or appearing incorrect
```typescript
// Debug state changes
const useMyStore = create<WithMultiplayer<MyState>>()(
  multiplayer(
    // ... your state
    {
      namespace: 'debug-app',
      logLevel: LogLevel.DEBUG,
      onHydrate: (state) => {
        console.log('Hydrated state:', state);
      },
      onConflict: (conflicts) => {
        console.log('Conflicts detected:', conflicts);
        return { strategy: 'keep-remote' };
      }
    }
  )
);
```

**Solutions**:
- Ensure you're using Immer-style mutations correctly
- Check that your namespace is unique and consistent
- Verify published/subscribed fields configuration
- Review conflict resolution strategy

### Debug Configuration

For development and debugging, use these enhanced settings:

```typescript
const useDebugStore = create<WithMultiplayer<MyState>>()(
  multiplayer(
    // ... your state creator
    {
      namespace: 'debug-namespace',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
      
      // Enhanced debugging
      logLevel: LogLevel.DEBUG,
      profiling: true,
      
      // Custom retry config for testing
      retryConfig: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 5000,
        backoffFactor: 1.5,
      },
      
      // WebSocket client debugging
      clientConfig: {
        maxReconnectAttempts: 5,
        throttling: {
          enabled: true,
          rateLimit: 10, // Lower rate limit for testing
        }
      },
      
      // Lifecycle debugging
      onHydrate: (state) => {
        console.log('🔄 State hydrated:', state);
      },
      
      onConflict: (conflicts) => {
        console.log('⚠️ Conflicts detected:', conflicts);
        // Log detailed conflict information
        conflicts.forEach((conflict, index) => {
          console.log(`Conflict ${index + 1}:`, {
            field: conflict.field,
            local: conflict.localValue,
            remote: conflict.remoteValue,
            pending: conflict.pendingValue,
          });
        });
        return { strategy: 'keep-remote' };
      },
    }
  )
);
```

## Documentation

### Complete Guides

- **[API Reference](./docs/API_REFERENCE.md)** - Complete API documentation with all types and methods
- **[Token API Guide](./docs/TOKEN_API.md)** - Authentication setup and security best practices

### Migration Guides

- **[From v0.4.x to v0.5.x](./CHANGELOG.md)** - Breaking changes and migration steps
- **[Converting Existing Stores](./docs/API_REFERENCE.md#migration)** - How to add multiplayer to existing stores

## Examples Repository

Check out the [`examples/`](./examples/) directory for complete working applications:

- **[Next.js Todo App](./examples/nextjs-starter/)** - Full-stack collaborative todo application with TypeScript
- **[Express Backend](./examples/express-starter/)** - Server-side store with REST API and client-side integration
- **[Enhanced Usage Examples](./examples/enhanced-usage.tsx)** - Advanced patterns and use cases

### Quick Examples

| Example | Description | Features |
|---------|-------------|----------|
| [Live Poll](./examples/enhanced-usage.tsx#L1-L30) | Real-time voting system | Counters, instant updates |
| [Collaborative Todos](./examples/nextjs-starter/) | Shared task management | CRUD operations, conflict resolution |
| [Mixed Sync](./examples/enhanced-usage.tsx#L60-L100) | Partial state sharing | Selective sync, local preferences |
| [Server Push](./examples/express-starter/) | Background notifications | Server-side updates, broadcasting |

## Best Practices

### 🏗️ Architecture Guidelines

1. **Use Records for Collections**: When dealing with collections that multiple users might edit simultaneously, use Record types instead of arrays:
   ```typescript
   // ✅ Good: Conflict-free updates
   todos: Record<string, Todo>
   
   // ❌ Avoid: Array conflicts
   todos: Todo[]
   ```

2. **Namespace Strategy**: Use descriptive, versioned namespaces:
   ```typescript
   // ✅ Good: Clear and versioned
   namespace: 'todo-app-v2'
   
   // ❌ Avoid: Generic or unversioned
   namespace: 'app'
   ```

3. **Selective Sync**: Only sync what needs to be shared:
   ```typescript
   publishUpdatesFor: () => ['sharedData', 'globalSettings'],
   subscribeToUpdatesFor: () => ['sharedData', 'globalSettings'],
   ```

### 🔐 Security Best Practices

1. **API Key Protection**: Never expose API keys in client code
2. **Token Validation**: Implement proper authentication in token endpoints
3. **Rate Limiting**: Add rate limiting to token generation endpoints
4. **CORS Configuration**: Configure CORS appropriately for production
5. **Input Validation**: Validate all data before storing in state

### ⚡ Performance Tips

1. **zFactor Optimization**: Choose the right granularity level
2. **Connection Monitoring**: Monitor connection health in production
3. **Error Boundaries**: Implement proper error handling
4. **Memory Management**: Use `destroy()` when components unmount
5. **Debouncing**: Consider debouncing rapid state changes

### 📊 Production Monitoring

```typescript
// Production monitoring setup
const useProductionStore = create<WithMultiplayer<State>>()(
  multiplayer(
    // ... state creator
    {
      namespace: 'production-app',
      logLevel: LogLevel.ERROR, // Reduce noise in production
      profiling: false, // Disable detailed profiling
      retryConfig: {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 30000,
        backoffFactor: 2,
      },
      onConflict: (conflicts) => {
        // Log conflicts for analysis
        analytics.track('multiplayer_conflict', {
          conflictCount: conflicts.length,
          fields: conflicts.map(c => c.field),
        });
        return { strategy: 'keep-remote' };
      },
    }
  )
);
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
git clone https://github.com/hpkv-io/zustand-multiplayer.git
cd zustand-multiplayer
npm install
npm run test
npm run build
```

### Reporting Issues

When reporting bugs, please include:
- Node.js and package versions
- Minimal reproduction case
- Error messages and stack traces
- Connection status and metrics (if available)

## License

MIT - see [LICENSE](./LICENSE) for details.

## Support

- **Documentation**: [Complete guides and API reference](./docs/)
- **Examples**: [Working applications](./examples/)
- **Issues**: [GitHub Issues](https://github.com/hpkv-io/zustand-multiplayer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hpkv-io/zustand-multiplayer/discussions)

---

**Built with ❤️ by the HPKV Team** | [Website](https://hpkv.io) | [Dashboard](https://hpkv.io/dashboard) 