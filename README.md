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

### 🔧 zFactor - Reduce chances of conflict

The `zFactor` controls how deeply nested objects are stored, affecting conflict resolution and performance:

- *Higher zFactor*: More storage granularity, less conflicts, potentially more calls over network for state upodates

- *Lower zFactor*: Less storage granularity, more chances of conflict, reduce calls over network for state updates



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

Adjust the zFactor to optimize the performance, conflict management and network saturation. If there are properties that usually are updated together, best is to adjust the zFactor in a way that stores all those properties in a single key, but if the properties are updated independently and concurrently by other users, adjust it to store each property in a single key.

If you don't set zFactor option, the default zFactor is 2 (three levels of storage granularity from root)

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
      zFactor: 2,  // Granular updates for smooth cursor movement
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
      zFactor: 1,  // Player-level granularity
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

// ✅ Correct: Use WithMultiplayer wrapper
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

### Type-Safe Configuration Options

The `MultiplayerOptions` interface provides full type safety for configuration:

```typescript
import { MultiplayerOptions, LogLevel } from '@hpkv/zustand-multiplayer';

// Type-safe configuration
const options: MultiplayerOptions<TodoState> = {
  namespace: 'my-app',
  apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
  tokenGenerationUrl: '/api/generate-token',
  
  // Type-safe field selection for sync
  sync: ['todos', 'filter'], // TypeScript ensures these keys exist in TodoState
  
  // Granularity control
  zFactor: 2, // 0-10 range enforced
  
  // Logging configuration
  logLevel: LogLevel.INFO, // Enum ensures valid values
  
  // Rate limiting
  rateLimit: 10, // Number of updates per second
};

const useStore = create<WithMultiplayer<TodoState>>()(
  multiplayer(stateCreator, options)
);
```

### Accessing Multiplayer State and Methods

The `WithMultiplayer` wrapper adds a `multiplayer` property to your state with full type safety:

```typescript
function TodoApp() {
  const { todos, addTodo, multiplayer } = useTodoStore();
  
  // Fully typed multiplayer state
  const connectionState: ConnectionState = multiplayer.connectionState;
  const hasHydrated: boolean = multiplayer.hasHydrated;
  const metrics: PerformanceMetrics = multiplayer.performanceMetrics;
  
  // Type-safe multiplayer methods (accessed via store reference)
  const store = useTodoStore;
  const handleForceSync = async () => {
    await store.multiplayer.reHydrate(); // Returns Promise<void>
  };
  
  const handleClearData = async () => {
    await store.multiplayer.clearStorage(); // Returns Promise<void>
  };
  
  // Connection monitoring
  const connectionStatus = store.multiplayer.getConnectionStatus(); // ConnectionStats | null
  const performanceData = store.multiplayer.getMetrics(); // PerformanceMetrics
  
  return (
    <div>
      <h1>Todos ({Object.keys(todos).length})</h1>
      <p>Status: {connectionState}</p>
      <p>Synced: {hasHydrated ? '✅' : '⏳'}</p>
      <p>Avg Sync Time: {metrics.averageSyncTime.toFixed(1)}ms</p>
      <button onClick={handleForceSync}>Force Sync</button>
    </div>
  );
}
```

### Complex State Types

For advanced use cases with nested objects and complex types:

```typescript
interface User {
  id: string;
  name: string;
  avatar?: string;
  lastSeen: Date;
}

interface Message {
  id: string;
  authorId: string;
  content: string;
  timestamp: Date;
  reactions: Record<string, string[]>; // emoji -> user IDs
}

interface ChatState {
  users: Record<string, User>;
  messages: Record<string, Message>;
  typing: Record<string, boolean>; // userId -> isTyping
  
  // Actions with proper typing
  addUser: (user: User) => void;
  removeUser: (userId: string) => void;
  sendMessage: (content: string, authorId: string) => void;
  setTyping: (userId: string, isTyping: boolean) => void;
  addReaction: (messageId: string, emoji: string, userId: string) => void;
}

const useChatStore = create<WithMultiplayer<ChatState>>()(
  multiplayer(
    (set, get) => ({
      users: {},
      messages: {},
      typing: {},
      
      addUser: (user) => set((state) => ({
        users: { ...state.users, [user.id]: user }
      })),
      
      removeUser: (userId) => set((state) => {
        const { [userId]: removed, ...users } = state.users;
        const { [userId]: removedTyping, ...typing } = state.typing;
        return { users, typing };
      }),
      
      sendMessage: (content, authorId) => set((state) => {
        const message: Message = {
          id: Date.now().toString(),
          authorId,
          content,
          timestamp: new Date(),
          reactions: {},
        };
        return {
          messages: { ...state.messages, [message.id]: message },
          typing: { ...state.typing, [authorId]: false }, // Clear typing
        };
      }),
      
      setTyping: (userId, isTyping) => set((state) => ({
        typing: { ...state.typing, [userId]: isTyping }
      })),
      
      addReaction: (messageId, emoji, userId) => set((state) => {
        const message = state.messages[messageId];
        if (!message) return state;
        
        const reactions = { ...message.reactions };
        if (!reactions[emoji]) reactions[emoji] = [];
        
        // Toggle reaction
        const userIndex = reactions[emoji].indexOf(userId);
        if (userIndex === -1) {
          reactions[emoji] = [...reactions[emoji], userId];
        } else {
          reactions[emoji] = reactions[emoji].filter(id => id !== userId);
          if (reactions[emoji].length === 0) {
            delete reactions[emoji];
          }
        }
        
        return {
          messages: {
            ...state.messages,
            [messageId]: { ...message, reactions }
          }
        };
      }),
    }),
    {
      namespace: 'chat-room',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
      // Only sync persistent data, not ephemeral typing indicators
      sync: ['users', 'messages'], 
      zFactor: 2, // Granular storage for individual messages and users
    }
  )
);
```

### Error Handling with Types

Handle errors with proper TypeScript types:

```typescript
import { ConnectionState } from '@hpkv/websocket-client';

function ConnectionManager() {
  const { multiplayer } = useTodoStore();
  const [error, setError] = useState<string | null>(null);
  
  const handleReconnect = async () => {
    setError(null);
    try {
      await useTodoStore.multiplayer.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };
  
  const handleClearData = async () => {
    if (!confirm('This will clear all data. Continue?')) return;
    
    try {
      await useTodoStore.multiplayer.clearStorage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed');
    }
  };
  
  return (
    <div>
      <div>
        Status: <span className={getStatusColor(multiplayer.connectionState)}>
          {multiplayer.connectionState}
        </span>
      </div>
      
      {error && <div className="error">{error}</div>}
      
      {multiplayer.connectionState === ConnectionState.DISCONNECTED && (
        <button onClick={handleReconnect}>Reconnect</button>
      )}
      
      <button onClick={handleClearData}>Clear All Data</button>
    </div>
  );
}

function getStatusColor(state: ConnectionState): string {
  switch (state) {
    case ConnectionState.CONNECTED: return 'green';
    case ConnectionState.CONNECTING: return 'orange';
    case ConnectionState.RECONNECTING: return 'orange';
    case ConnectionState.DISCONNECTED: return 'red';
    default: return 'gray';
  }
}
```

### Token Generation with Types

Type-safe token generation for your backend:

```typescript
// types/token.ts
import { TokenRequest, TokenResponse } from '@hpkv/zustand-multiplayer/auth/token-helper';

export interface AuthenticatedUser {
  id: string;
  email: string;
  permissions: string[];
}

export interface TokenGenerationRequest extends TokenRequest {
  // Add any additional fields your app needs
  userId?: string;
  permissions?: string[];
}

// pages/api/generate-token.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { TokenHelper } from '@hpkv/zustand-multiplayer/auth/token-helper';
import { AuthenticatedUser, TokenGenerationRequest } from '../types/token';

const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY!,
  process.env.HPKV_API_BASE_URL!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TokenResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Type-safe authentication
    const user: AuthenticatedUser | null = await authenticateUser(
      req.headers.authorization
    );
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Type-safe request validation
    const tokenRequest: TokenGenerationRequest = req.body;
    
    if (!tokenRequest.namespace || typeof tokenRequest.namespace !== 'string') {
      return res.status(400).json({ error: 'Invalid namespace' });
    }
    
    // Check permissions
    if (!user.permissions.includes(`namespace:${tokenRequest.namespace}`)) {
      return res.status(403).json({ error: 'Access denied to namespace' });
    }
    
    // Generate token with full type safety
    const response: TokenResponse = await tokenHelper.processTokenRequest(tokenRequest);
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

async function authenticateUser(
  authorization?: string
): Promise<AuthenticatedUser | null> {
  // Your authentication logic here
  // Return null if not authenticated, user object if authenticated
  return null;
}
```

### Generic Store Factory

Create reusable typed store factories:

```typescript
// utils/store-factory.ts
import { create } from 'zustand';
import { multiplayer, WithMultiplayer, MultiplayerOptions } from '@hpkv/zustand-multiplayer';

export function createMultiplayerStore<T extends Record<string, any>>(
  stateCreator: (set: any, get: any) => T,
  options: MultiplayerOptions<T>
) {
  return create<WithMultiplayer<T>>()(
    multiplayer(stateCreator, options)
  );
}

// Usage
interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
}

const useCounterStore = createMultiplayerStore<CounterState>(
  (set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
    decrement: () => set((state) => ({ count: state.count - 1 })),
  }),
  {
    namespace: 'counter',
    apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
    tokenGenerationUrl: '/api/generate-token',
  }
);
```

### Type-Safe Middleware Composition

Combine with other Zustand middlewares while maintaining type safety:

```typescript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { multiplayer, WithMultiplayer } from '@hpkv/zustand-multiplayer';

interface AppState {
  user: User | null;
  settings: UserSettings;
  setUser: (user: User) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
}

const useAppStore = create<WithMultiplayer<AppState>>()(
  multiplayer(
    subscribeWithSelector<AppState>((set) => ({
      user: null,
      settings: { theme: 'light', notifications: true },
      
      setUser: (user) => set({ user }),
      
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
    })),
    {
      namespace: 'app-state',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
      sync: ['user', 'settings'], // Type-safe field selection
    }
  )
);

// Type-safe subscriptions
useAppStore.subscribe(
  (state) => state.user, // TypeScript knows this is User | null
  (user) => {
    if (user) {
      console.log('User logged in:', user.name);
    }
  }
);
```

### Common TypeScript Patterns

**1. Conditional State Based on Connection:**

```typescript
function TodoList() {
  const { todos, multiplayer } = useTodoStore();
  
  // Type-safe conditional rendering
  if (multiplayer.connectionState === ConnectionState.DISCONNECTED) {
    return <div>Offline - some features may not work</div>;
  }
  
  if (!multiplayer.hasHydrated) {
    return <div>Loading...</div>;
  }
  
  return (
    <div>
      {Object.values(todos).map(todo => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </div>
  );
}
```

**2. Type Guards for Store Methods:**

```typescript
function isMultiplayerStore<T>(
  store: any
): store is { multiplayer: { connect: () => Promise<void> } } {
  return store && typeof store.multiplayer?.connect === 'function';
}

// Usage
if (isMultiplayerStore(someStore)) {
  await someStore.multiplayer.connect(); // TypeScript knows this is safe
}
```

This TypeScript guide ensures you get the full benefits of type safety while building multiplayer applications with Zustand Multiplayer.

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

#### 1. **Next.js + React Example** ([`/examples/nextjs-todo`](./examples/nextjs-starter))
A modern React application with TypeScript showing:
- Full-stack setup with Next.js
- Token generation endpoint implementation
- React hooks integration
- TypeScript

#### 2. **Express + Vanilla JS Example** ([`/examples/express-vanilla`](./examples/express-starter))
A traditional web application demonstrating:
- Vanilla JavaScript (no framework)
- HTML5 with real-time updates
- Token endpoint with Express.js

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

**Built with ❤️ by the HPKV Team** | [Website](https://hpkv.io) | [Dashboard](https://hpkv.io/dashboard)