# Zustand Multiplayer Middleware

[![npm version](https://img.shields.io/npm/v/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)
[![npm downloads](https://img.shields.io/npm/dm/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is Multiplayer?

Multiplayer is a Zustand middleware that adds real-time synchronization capabilities to your stores. When you wrap your store with the multiplayer middleware, every state change is automatically:
- **Synchronized** across all connected clients in real-time via WebSockets
- **Persisted** to a distributed database with atomic operations
- **Shared** with all connected users instantly

**No WebSocket server needed!** Multiplayer is built on top of [HPKV's WebSocket API](https://hpkv.io/docs/websocket-api), so you don't need to set up or maintain any server infrastructure. Just [create a free HPKV API key](https://hpkv.io/signup) in a few clicks, configure your store options, and you're ready to go.

Think of it as adding a "sync engine" to your existing Zustand store - turning any local state into shared, collaborative state that multiple users can interact with simultaneously.

**Transform any Zustand store into a real-time synchronized multiplayer experience with just one line of code.**

```typescript
// Before: Local Zustand store
const useStore = create((set) => ({
  todos: {},
  addTodo: (text) => set(state => ...)
}));

// After: Real-time multiplayer store
const useStore = create(
  multiplayer((set) => ({
    todos: {},
    addTodo: (text) => set(state => ...)
  }), { namespace: 'my-app' })
);
```

That's it! Your store now syncs in real-time across all connected clients. 🎉

## Why Zustand Multiplayer?

Building real-time collaborative features is complex. You need WebSockets, conflict resolution, state persistence, and synchronization logic. Zustand Multiplayer handles all of this for you:

- **🔄 Instant Synchronization** - State changes propagate to all clients in milliseconds
- **💾 Automatic Persistence** - State survives page refreshes and reconnections
- **🎯 Selective Sync** - Choose exactly what to share vs keep local
- **⚡ Optimized Performance** - Granular updates, minimal network traffic
- **🔌 Works Everywhere** - React, Node.js, vanilla JavaScript, Client, Server - anywhere Zustand works

## Installation

```bash
npm install @hpkv/zustand-multiplayer zustand
```

## 5-Minute Quick Start

### 1. Get Your API Credentials

Sign up at [hpkv.io](https://hpkv.io/signup) and get your API credentials from the [dashboard](https://hpkv.io/dashboard/api-keys).

### 2. Create a Multiplayer Store

```typescript
// store.ts
import { create } from 'zustand';
import { multiplayer, WithMultiplayer } from '@hpkv/zustand-multiplayer';

interface AppState {
  count: number;
  increment: () => void;
}

export const useStore = create<WithMultiplayer<AppState>>()(
  multiplayer(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    {
      namespace: 'counter-app',  // Unique identifier for your app
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',  // Your auth endpoint
    }
  )
);
```

### 3. Set Up Token Generation (Security)

Create an endpoint to generate tokens for client authentication:

```typescript
// pages/api/generate-token.ts (Next.js) or server.js (Express)
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY!,
  process.env.HPKV_API_BASE_URL!
);

export default async function handler(req, res) {
  // Add your authentication logic here
  // const user = await authenticate(req);
  // if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const response = await tokenHelper.processTokenRequest(req.body);
  res.status(200).json(response);
}
```

### 4. Use in Your App

```tsx
// App.tsx
import { useStore } from './store';

function App() {
  const { count, increment, multiplayer } = useStore();
  
  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={increment}>+1</button>
      <p>Open this page in multiple tabs to see real-time sync!</p>
      <p>Status: {multiplayer.connectionState}</p>
    </div>
  );
}
```

That's it! Your app now syncs in real-time. Open it in multiple browser tabs to see the magic. ✨

## Core Concepts

### 🏷️ Namespaces - Your Sync Scope

A namespace is a unique identifier that determines which stores sync together. Think of it as a "room" where all stores with the same namespace share state.

```typescript
// All stores with namespace 'team-dashboard' will sync together
{ namespace: 'team-dashboard' }

// Different namespaces = isolated data
{ namespace: 'team-dashboard' }  // These sync together
{ namespace: 'user-settings' }   // This is completely separate
```

**Best Practices:**
- Use descriptive, unique namespaces: `todo-app-v1`, `game-room-${roomId}`
- Version your namespaces when making breaking changes: `app-v1` → `app-v2`
- Use dynamic namespaces for isolated sessions: `meeting-${meetingId}`

### 🔐 Authentication - Client vs Server

When creating a store using multiplayer, you either need to provide HPKV API key or a token generation url. As API key should never be exposed on client-side, for client-side usage always setup a token generation endpoint, but for server-side usage, you can use the API key directly.

See the documentation on how to set up the token generation endpoint in the [Token Generation Guideline](/docs/TOKEN_API.md)

**Client-side (Web Apps):**
```typescript
// Never expose API keys in client code!
{
  namespace: 'my-app',
  apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL,
  tokenGenerationUrl: '/api/generate-token',  // Secure backend endpoint
}
```

**Server-side (Node.js):**
```typescript
// Safe to use API key directly on server
{
  namespace: 'my-app',
  apiBaseUrl: process.env.HPKV_API_BASE_URL,
  apiKey: process.env.HPKV_API_KEY,  // Direct API key usage
}
```

### 🎯 Selective Synchronization

By default, ```multiplayer``` syncs all the state with other clients, but it also allows you to control exactly what syncs and what stays local through ```sync``` option:

```typescript
const useStore = create(
  multiplayer(
    (set) => ({
      // Shared data
      sharedTodos: {},
      teamSettings: {},
      
      // Local data
      draftText: '',
      userPreferences: {},
      
      // Actions...
    }),
    {
      namespace: 'my-app',
      // Only sync these fields
      sync: ['sharedTodos', 'teamSettings'],
      // Everything else stays local
    }
  )
);
```

### 🔧 zFactor - Fine-tune for best performance and less conflicts

The `zFactor` controls storage granularity. Choose based on **what gets updated, how often, and together**:

```typescript
// Example state structure
{
  users: {
    user1: { name: 'Alice', score: 10 },
    user2: { name: 'Bob', score: 20 }
  }
}
```

```
zFactor: 0 (Atomic)          zFactor: 1 (Default)         zFactor: 2 (Granular)
┌─────────────────┐          ┌──────────────┐             ┌─────────────────┐
│ Store entire    │          │ Each user    │             │ Each property   │
│ 'users' object  │          │ stored       │             │ stored          │
│ as one unit     │          │ separately   │             │ separately      │
└─────────────────┘          └──────────────┘             └─────────────────┘
        ↓                            ↓                             ↓
  users → {...}               users:user1 → {...}          users:user1:name → 'Alice'
                             users:user2 → {...}          users:user1:score → 10
                                                          users:user2:name → 'Bob'
                                                          users:user2:score → 20
```
Analyze your specific state structure and update frequency. There's no universal "right" zFactor for application types.

If you don't set zFactor option, the default zFactor is 2 (two levels of storage granularity from root)
## Exapmle Recipes

### 🗳️ Live Voting/Polling

```typescript
const usePollStore = create(
  multiplayer(
    (set) => ({
      votes: {} as Record<string, number>,
      vote: (option: string) => set((state) => {
        state.votes[option] = (state.votes[option] || 0) + 1;
      }),
    }),
    { namespace: `poll-${pollId}` }
  )
);
```

### 👥 Presence & Live Cursors

```typescript
const usePresenceStore = create(
  multiplayer(
    (set) => ({
      users: {} as Record<string, { name: string; cursor: { x: number; y: number } }>,
      updateCursor: (userId: string, x: number, y: number) => set((state) => {
        state.users[userId] = { ...state.users[userId], cursor: { x, y } };
      }),
    }),
    { 
      namespace: 'collaborative-canvas',
    }
  )
);
```

### 🎮 Game State

```typescript
const useGameStore = create(
  multiplayer(
    (set) => ({
      players: {} as Record<string, Player>,
      gameState: 'waiting' as 'waiting' | 'playing' | 'finished',
      scores: {} as Record<string, number>,
      
      joinGame: (playerId: string, name: string) => set((state) => {
        state.players[playerId] = { id: playerId, name, ready: false };
      }),
      
      updateScore: (playerId: string, points: number) => set((state) => {
        state.scores[playerId] = (state.scores[playerId] || 0) + points;
      }),
    }),
    { 
      namespace: `game-room-${roomId}`,
    }
  )
);
```

### 📝 Collaborative Forms

```typescript
const useFormStore = create(
  multiplayer(
    (set) => ({
      formData: {},
      fieldLocks: {} as Record<string, string>,  // Track who's editing what
      
      updateField: (field: string, value: any, userId: string) => set((state) => {
        if (!state.fieldLocks[field] || state.fieldLocks[field] === userId) {
          state.formData[field] = value;
          state.fieldLocks[field] = userId;
        }
      }),
      
      releaseField: (field: string) => set((state) => {
        delete state.fieldLocks[field];
      }),
    }),
    {
      namespace: `form-${formId}`,
      sync: ['formData', 'fieldLocks'],  // Don't sync local validation errors
    }
  )
);
```

### 🔔 Server-to-Client Broadcasting

```typescript
// Server-side (Node.js)
import { createStore } from 'zustand/vanilla';

const broadcastStore = createStore(
  multiplayer(
    (set) => ({
      notifications: [] as Notification[],
      broadcast: (message: string) => set((state) => ({
        notifications: [...state.notifications, {
          id: Date.now(),
          message,
          timestamp: new Date(),
        }],
      })),
    }),
    {
      namespace: 'system-notifications',
      apiKey: process.env.HPKV_API_KEY,  // Server uses API key directly
    }
  )
);

// Broadcast to all clients
broadcastStore.getState().broadcast('System maintenance at 5 PM');
```

## Advanced Features

### ⚡ Performance Optimization

For applications with high-frequency updates, consider these optimization strategies:

```typescript
// Example: Optimizing a collaborative drawing app
const useCanvasStore = create(
  multiplayer(
    (set) => ({
      strokes: {},
      currentStroke: null,
      
      // Batch updates for better performance
      updateStroke: debounce((strokeId, points) => set((state) => {
        state.strokes[strokeId] = points;
      }), 100), // Debounce to max 10 updates/second. This should not exceed the rate limit for better performance
    }),
    {
      namespace: 'canvas',
      rateLimit: 10,    // Match your HPKV tier (Free: 10/s, Pro: 100/s)
      zFactor: 1,       // Store each stroke separately
    }
  )
);
```

**Performance Tips:**
- **Set `rateLimit`** to match your HPKV tier to enable automatic throttling
- **Use debouncing** for high-frequency events (mouse moves, typing)
- **Batch updates** when possible to reduce network calls
- **Choose appropriate `zFactor`** - higher values mean more granular updates but more keys

### 🔄 Middleware Composition

Zustand Multiplayer works seamlessly with other middlewares:

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { multiplayer } from '@hpkv/zustand-multiplayer';

const useStore = create(
  multiplayer(
    subscribeWithSelector(
      immer((set) => ({
        // Immer allows direct mutations
        todos: {},
        addTodo: (text: string) => set((state) => {
          const id = Date.now().toString();
          state.todos[id] = { id, text, completed: false };  // Direct mutation!
        }),
        toggleTodo: (id: string) => set((state) => {
          state.todos[id].completed = !state.todos[id].completed;
        }),
      }))
    ),
    { namespace: 'todos-with-immer' }
  )
);

// Subscribe to specific changes
useStore.subscribe(
  (state) => state.todos,
  (todos) => console.log('Todos changed:', todos)
);
```

### 📊 Monitoring & Debugging

```typescript
function ConnectionMonitor() {
  const { multiplayer } = useStore();
   
  return (
    <div>
      <p>Status: {multiplayer.connectionState}</p>
      <p>Round Trip Latency: {multiplayer.performanceMetrics.averageSyncTime}ms</p>
      <button onClick={() => multiplayer.reHydrate()}>Force Sync</button>
    </div>
  );
}
```

## TypeScript Usage Guide

Zustand Multiplayer is built with TypeScript-first design and provides full type safety for your multiplayer stores.

### Basic Type Setup

Always use the `WithMultiplayer<T>` wrapper type to ensure proper typing:

```typescript
import { create } from 'zustand';
import { multiplayer, WithMultiplayer } from '@hpkv/zustand-multiplayer';

interface TodoState {
  todos: Record<string, Todo>;
  filter: 'all' | 'active' | 'completed';
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  setFilter: (filter: TodoState['filter']) => void;
}

// Use WithMultiplayer wrapper
const useTodoStore = create<WithMultiplayer<TodoState>>()(
  multiplayer(
    (set) => ({
      todos: {},
      filter: 'all',
      addTodo: (text) => set((state) => ({
        todos: {
          ...state.todos,
          [Date.now().toString()]: { id: Date.now().toString(), text, completed: false }
        }
      })),
      toggleTodo: (id) => set((state) => ({
        todos: {
          ...state.todos,
          [id]: { ...state.todos[id], completed: !state.todos[id].completed }
        }
      })),
      setFilter: (filter) => set({ filter }),
    }),
    {
      namespace: 'todos-app',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
    }
  )
);
```
## Using Without React

Zustand Multiplayer works anywhere Zustand works - not just React!

### Vanilla JavaScript

```javascript
import { createStore } from 'zustand/vanilla';
import { multiplayer } from '@hpkv/zustand-multiplayer';

const store = createStore(
  multiplayer(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    {
      namespace: 'vanilla-counter',
      apiKey: 'your-api-key',  // Server-side only!
    }
  )
);

// Use the store
store.getState().increment();
console.log(store.getState().count);

// Subscribe to changes
store.subscribe((state) => {
  document.getElementById('count').textContent = state.count;
});
```

### Node.js Server

```javascript
import { createStore } from 'zustand/vanilla';
import { multiplayer } from '@hpkv/zustand-multiplayer';

// Create a server-side store
const metricsStore = createStore(
  multiplayer(
    (set) => ({
      metrics: {},
      updateMetric: (key, value) => set((state) => {
        state.metrics[key] = value;
      }),
    }),
    {
      namespace: 'server-metrics',
      apiKey: process.env.HPKV_API_KEY,
    }
  )
);

// Update metrics from your server
setInterval(() => {
  metricsStore.getState().updateMetric('cpu', process.cpuUsage());
  metricsStore.getState().updateMetric('memory', process.memoryUsage());
}, 5000);
```

## 🔐 Security Best Practices

### Token Generation Endpoint

Always implement proper authentication and authorization:

```typescript
// api/generate-token.ts
export default async function handler(req, res) {
  // 1. Authenticate the user
  const user = await authenticateUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // 2. Check permissions for the requested namespace
  const { namespace } = req.body;
  if (!user.canAccessNamespace(namespace)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // 3. Rate limiting
  if (await isRateLimited(user.id)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  // 4. Generate token
  const token = await tokenHelper.processTokenRequest({
    ...req.body
  });
  
  // 5. Log for audit
  await logTokenGeneration(user.id, namespace);
  
  return res.status(200).json(token);
}
```

### Important Security Notes

- **Never expose API keys** in client-side code
- **Tokens expire** after 2 hours by default
- **Anyone with a token** can read/write to that namespace
- **Implement authorization** in your token endpoint
- **Consider rate limiting** to prevent abuse

## API Reference

### Multiplayer Options

```typescript
interface MultiplayerOptions<TState> {
  namespace: string;              // Required: Unique identifier
  apiBaseUrl: string;             // Required: HPKV API URL
  apiKey?: string;                // Server-side only
  tokenGenerationUrl?: string;    // Client-side only
  sync?: Array<keyof TState>;    // Fields to sync (default: all non-function keys)
  zFactor?: number;               // Storage depth (0-10, default: 1)
  logLevel?: LogLevel;            // Logging verbosity
  rateLimit?: number;             // Throttle to N req/s (match your HPKV tier)
}
```

### Multiplayer State & Methods

```typescript
// Access via store
const { multiplayer } = useStore();

// State (reactive)
multiplayer.connectionState     // 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'RECONNECTING'
multiplayer.hasHydrated        // boolean - Has initial sync completed

multiplayer.performanceMetrics  // perfromance metrics

const store = useStore();
// Methods
await store.multiplayer.reHydrate();        // Force sync with server
await store.multiplayer.clearStorage();     // Clear all persisted data
await store.multiplayer.disconnect();       // Close connection
await store.multiplayer.connect();          // Establish connection
await store.multiplayer.destroy();          // Cleanup (call on unmount)

// Monitoring
store.store.multiplayer.getConnectionStatus();    // Detailed connection info
store.multiplayer.getMetrics();             // Performance metrics
```

### Rate Limiting & Throttling

HPKV has rate limits based on your tier (Free tier: 10 requests/second). The `rateLimit` option enables automatic throttling to avoid hitting these limits:

```typescript
{
  namespace: 'high-frequency-app',
  rateLimit: 10,  // Automatically throttle to 10 updates/second
}
```

**For high-frequency updates** (e.g., mouse movements, real-time drawing):
- Consider debouncing or throttling at the application level
- Batch multiple changes into single updates
- Use higher zFactor for granular updates to reduce operation size

## Examples & Resources

### 📦 Example Applications

We provide two complete example applications demonstrating real-world usage:

#### 1. **Next.js + React - Collaborative ToDo List Example** ([`/examples/nextjs-collaborative-todo`](./examples/nextjs-collaborative-todo))
- Full-stack setup with Next.js
- Token generation endpoint implementation
- React hooks integration
- TypeScript

#### 2. **Vanilla JS - Collaborative ToDo List Example** ([`/examples/javascript-collaborative-todo`](./examples/javascript-collaborative-todo))
- Vanilla JavaScript (no framework)
- HTML5 with real-time updates
- Token endpoint with Express.js

#### 2. **React - Realtime Chat Example** ([`/examples/react-chat`](./examples/react-chat))
A traditional web application demonstrating:
- React
- Token endpoint with Express.js
- Typescript

### 📚 Documentation

- **[API Documentation](./docs/API_REFERENCE.md)** - Detailed API reference
- **[Token Setup Guide](./docs/TOKEN_API.md)** - Authentication implementation
- **[Migration Guide](./CHANGELOG.md)** - Upgrading from older versions

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/hpkv-io/zustand-multiplayer.git
cd zustand-multiplayer
npm install
npm test
```

## Support

- **Issues**: [GitHub Issues](https://github.com/hpkv-io/zustand-multiplayer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hpkv-io/zustand-multiplayer/discussions)
- **Email**: support@hpkv.io

## License

MIT © [HPKV Team](https://hpkv.io)

---
