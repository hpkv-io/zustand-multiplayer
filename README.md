# Zustand Multiplayer Middleware

[![npm version](https://img.shields.io/npm/v/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)
[![npm downloads](https://img.shields.io/npm/dm/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)

![HPKV logo](assets/images/logo.png)

**Real-time state synchronization for Zustand stores.** Build collaborative applications with automatic state sharing across multiple clients. The `multiplayer` middleware brings **state persistence** and **real-time synchronization** to Zustand stores, making it easy to build multiplayer applications.



## What is Zustand Multiplayer?

Zustand Multiplayer is a powerful middleware that transforms any Zustand store into a real-time collaborative state management system. It provides:

### ✨ **Key Features**

- **🔄 Real-time Synchronization** - Automatic state sharing across all connected clients
- **💾 Persistent Storage** - All state changes are automatically stored for durability
- **🎯 Selective Sync** - Choose which parts of your state to share vs keep local
- **🔧 Granular Storage** - Store individual items in Record fields for conflict-free collaboration
- **⚡ Performance Optimized** - Efficient change detection and minimal network traffic
- **🔌 TypeScript Ready** - Full type safety with proper TypeScript integration


### 🎯 **Usage Examples**

- **Collaborative Apps** - Real-time document editing, live polls, shared whiteboards
- **Multiplayer Games** - Shared game state, player positions, scores
- **Team Dashboards** - Live metrics, shared settings, real-time notifications
- **Social Features** - Live comments, shared preferences, collaborative lists

## Installation

```bash
npm install @hpkv/zustand-multiplayer zustand
```

## Prerequisites

1. Sign up at [hpkv.io](https://hpkv.io/signup)
2. Get your free API key and base URL from the [dashboard](https://hpkv.io/dashboard/api-keys)


## Quick Start

### 1. Create a Live Poll store

```javascript
// store.js
import { create } from 'zustand';
import { multiplayer } from '@hpkv/zustand-multiplayer';

export const usePollStore = create(
  multiplayer(
    (set) => ({
      votes: {},
      vote: (option) => set((state) => {
        if (!state.votes[option]) {
          state.votes[option] = 0;
        }
        state.votes[option] = state.votes[option] + 1;
      }),
    }),
    {
      namespace: 'live-poll',
      apiBaseUrl: 'YOUR_HPKV_BASE_URL',
      tokenGenerationUrl: 'http://localhost:3000/api/generate-token',
    })
);
```

### 2. Setup your token generation endpoint

```javascript
// Your backend API endpoint
import { TokenHelper } from '@hpkv/zustand-multiplayer';
import http from 'node:http';

const tokenHelper = new TokenHelper(
  'Your_HPKV_API-Key',
  'Your_HPKV_API_Base_URL'
);

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate-token') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const requestBody = JSON.parse(body);
      // Use TokenHelper to generate token
      const response = await tokenHelper.processTokenRequest(requestBody);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3000, () => console.log('Token server running on port 3000'));
```

> 📖 **See [Token API Guide](./docs/TOKEN_API.md)** for more details on the details and implementations in Express, Next.js, Fastify, and other frameworks.

### 3. Use in Your App

```javascript
// App.js
import { usePollStore } from './store';

function App() {
  const { votes, vote } = usePollStore();
  
  return (
    <div>
      <h1>What's your favorite food? 🍕</h1>
      <button onClick={() => vote('pizza')}>Pizza ({votes[pizza] ?? 0})</button>
      <button onClick={() => vote('burger')}>Burger ({votes[burger] ?? 0})</button>
      <button onClick={() => vote('tacos')}>Tacos ({votes[tacos] ?? 0})</button>
      <p>👆 Vote and watch results update live across all devices!</p>
    </div>
  );
}
```

**🎉 That's it!** Creating your online voting application just takes some simple steps!

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

### 🔧 Granular Storage - Reduce Conflicts in  Collaborative Apps

Multiplayer uses  a granular storage scheme that defines how nested state is stored and synchronized. Instead of treating entire objects as single units, it breaks down nested structures into individual storage keys, avoiding unnecessary conflicts for collaborative editing.

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
For this example state value
```
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
      "text": "Buy milk"
    },
    "2": {
      "id": "2",
      "text": "Walk dog"
    }
  }
}
```
Each state part will be stored in a sepearate key in databse:
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


```javascript
export const useAppStore = create(
  multiplayer(
    (set) => ({
      // Nested object structure
      user: {
        profile: { name: '', email: '' },
        preferences: { theme: 'light', notifications: true }
      },
      // Record structure (key-value pairs)
      todos: {},

      updateUserEmail: (email) => set((state) => {
        state.user.profile.email = email
      }),
      updatePreferences: (prefs) => set((state) => {
        state.user.preferences = { ...state.user.preferences, ...prefs };
      }),
      // Actions for Record structure
      addTodo: (text) => set((state) => {
        const id = Date.now().toString();
        state.todos[id] = { id, text, completed: false };
      }),
      updateTodo: (id, updates) => set((state) => {
        if (state.todos[id]) {
          state.todos[id] = { ...state.todos[id], ...updates };
        }
      }),
    }),
    {
      namespace: 'collaborative-app',
      // options...
    })
);
```

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

```javascript
// Get connection status and performance metrics
const multiplayer = useMyStore((state) => state.multiplayer);

// Connection status
const status = multiplayer.getConnectionStatus();
console.log('Connected:', status?.isConnected);
console.log('Reconnect attempts:', status?.reconnectAttempts);
console.log('Pending messages:', status?.messagesPending);

// Performance metrics
const metrics = multiplayer.getMetrics();
console.log('State changes processed:', metrics.stateChangesProcessed);
console.log('Average sync time:', metrics.averageSyncTime);
console.log('Average hydration time:', metrics.averageHydrationTime);
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

## Documentation

- **[API Reference](./docs/API_REFERENCE.md)** - Complete API documentation
- **[Token API Guide](./docs/TOKEN_API.md)** - Authentication setup

## Examples Repository

Check out the [`examples/`](./examples/) directory for complete working applications:

- **[Next.js Todo App](./examples/nextjs-starter/)** - Full-stack collaborative todo application
- **[Express Backend](./examples/express-starter/)** - Server-side store with REST API

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](./LICENSE) for details.

---

**Need help?** Check our [documentation](./docs/) or [open an issue](https://github.com/hpkv-io/zustand-multiplayer/issues). 