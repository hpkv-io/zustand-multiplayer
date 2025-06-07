# Zustand Multiplayer Middleware

[![npm version](https://img.shields.io/npm/v/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)
[![npm downloads](https://img.shields.io/npm/dm/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)

![HPKV logo](assets/images/logo.png)

**Real-time state synchronization for Zustand stores.** Build collaborative applications with automatic state sharing across multiple clients.

🚀 **[Quick Start](#quick-start)** • 📖 **[Examples](#examples)** • 🔧 **[API Reference](./docs/API_REFERENCE.md)**

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
      votes: { pizza: 0, burger: 0, tacos: 0 },
      vote: (option) => set((state) => ({
        votes: {
          ...state.votes,
          [option]: state.votes[option] + 1
        }
      })),
    }),
    {
      namespace: 'live-poll',
      apiBaseUrl: 'YOUR_HPKV_BASE_URL',
      tokenGenerationUrl: '/api/generate-token',
    }
  )
);
```

### 2. Create Token Endpoint

```javascript
// Your backend API endpoint
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY,
  process.env.HPKV_API_BASE_URL
);

// In your POST /api/generate-token handler
async function handleTokenRequest(requestBody) {
  try {
    const response = await tokenHelper.processTokenRequest(requestBody);
    return response; // { namespace: "live-poll", token: "eyJ..." }
  } catch (error) {
    return { error: error.message };
  }
}
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
      <button onClick={() => vote('pizza')}>Pizza ({votes.pizza})</button>
      <button onClick={() => vote('burger')}>Burger ({votes.burger})</button>
      <button onClick={() => vote('tacos')}>Tacos ({votes.tacos})</button>
      <p>👆 Vote and watch results update live across all devices!</p>
    </div>
  );
}
```

**🎉 That's it!** Creating an online voting application is that easy!

## Multiplayer State & Methods

Every store created with the multiplayer middleware provides a `multiplayer` object with state and methods for managing the connection and synchronization:

```javascript
// Access multiplayer object from any store
const multiplayer  = useMyStore((state) => state.multiplayer);

// Connection state (reactive)
console.log(multiplayer.connectionState); 

// Manual control methods
multiplayer.hydrate();        // Refresh from server
multiplayer.clearStorage();   // Clear local data
multiplayer.connect();        // Reconnect
multiplayer.disconnect();     // Disconnect
```

**Available State:**
- `connectionState` - Reactive connection state object

**Available Methods:**
- `hydrate()` - Manually sync with server state
- `clearStorage()` - Clear all local stored data
- `connect()` - Establish connection
- `disconnect()` - Close connection
- `getMetrics()` - Get performance statistics


## Non-React Usage

### Vanilla JavaScript

```javascript
import { createStore } from 'zustand/vanilla';
import { multiplayer } from '@hpkv/zustand-multiplayer';

// Create store without React hooks
const gameStore = createStore(
  multiplayer(
    (set, get) => ({
      players: {},
      gameState: 'waiting',
      addPlayer: (id, name) => set((state) => ({
        players: { ...state.players, [id]: { name, score: 0 } }
      })),
      updateScore: (playerId, score) => set((state) => ({
        players: {
          ...state.players,
          [playerId]: { ...state.players[playerId], score }
        }
      })),
      startGame: () => set({ gameState: 'playing' }),
    }),
    {
      namespace: 'multiplayer-game',
      apiBaseUrl: process.env.HPKV_API_BASE_URL,
      apiKey: process.env.HPKV_API_KEY, // Server-side only
    }
  )
);

// Usage in vanilla JS
gameStore.getState().addPlayer('player1', 'Alice');
gameStore.getState().startGame();

// Subscribe to changes
const unsubscribe = gameStore.subscribe((state) => {
  console.log('Game state updated:', state);
  updateGameUI(state);
});
```

### Node.js Server-Side

Server-side stores can use your API key directly for authentication (no token generation endpoint needed). When client and server stores share the same namespace, they automatically synchronize state in real-time:

```javascript
// server-store.js
import { createStore } from 'zustand/vanilla';
import { multiplayer } from '@hpkv/zustand-multiplayer';

const serverStore = createStore()(
  multiplayer(
    (set) => ({
      notifications: [],
      addNotification: (message) => set((state) => ({
        notifications: [...state.notifications, { message, timestamp: Date.now() }]
      })),
    }),
    {
      namespace: 'live-updates',
      apiBaseUrl: process.env.HPKV_API_BASE_URL,
      apiKey: process.env.HPKV_API_KEY,
    }
  )
);

// Event-driven updates (when something actually happens)
app.post('/webhook/payment', (req, res) => {
  serverStore.getState().addNotification(`Payment received: $${req.body.amount}`);
  res.json({ received: true });
});

app.post('/api/user-signup', (req, res) => {
  serverStore.getState().addNotification(`New user: ${req.body.name}`);
  res.json({ success: true });
});
```

```javascript
// client-store.js
export const useAppStore = create()(
  multiplayer(
    (set) => ({
      notifications: [],
      addNotification: (message) => set((state) => ({
        notifications: [...state.notifications, { message, timestamp: Date.now() }]
      })),
    }),
    {
      namespace: 'live-updates', // Same namespace = shared state
      apiBaseUrl: 'hpkv-api-base-url',
      tokenGenerationUrl: '/api/generate-token',
    }
  )
);
```

## Advanced Features

### Offline Conflict Resolution

When a client goes offline and comes back online, it may have missed updates from other clients. The conflict resolution system handles reconciling local pending changes with the current server state:

```javascript
// store.js
export const useDocumentStore = create(
  multiplayer(
    (set) => ({
      title: '',
      content: '',
      lastModified: null,
      setTitle: (title) => set({ title, lastModified: Date.now() }),
      setContent: (content) => set({ content, lastModified: Date.now() }),
    }),
    {
      namespace: 'shared-document',
      apiBaseUrl: 'hpkv-api-base-url',
      tokenGenerationUrl: '/api/generate-token',
      
      // Handle conflicts when reconnecting after being offline
      onConflict: (conflicts) => {
        console.log('Resolving conflicts after reconnection:', conflicts);
        
        // Example: Smart merge for document content
        const contentConflict = conflicts.find(c => c.field === 'content');
        if (contentConflict) {
          // Your local changes while offline
          const localContent = contentConflict.pendingValue;
          // Changes from other clients while you were offline  
          const remoteContent = contentConflict.remoteValue;
          
          // Custom merge strategy
          return {
            strategy: 'merge',
            mergedValues: {
              content: mergeDocumentContent(localContent, remoteContent),
              lastModified: Date.now()
            }
          };
        }
        
        // For other fields, prefer remote (server) version
        return { strategy: 'keep-remote' };
      }
    }
  )
);

function mergeDocumentContent(localContent, remoteContent) {
  // Simple append strategy - you could implement more sophisticated merging
  if (localContent === remoteContent) return localContent;
  return `${remoteContent}\n\n--- Your offline changes ---\n${localContent}`;
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
- `merge`: Custom merge with `mergedValues` (recommended for collaborative editing)

### Selective Synchronization

Control what gets shared:

```javascript
export const useUserStore = create(
  multiplayer(
    (set) => ({
      theme: 'light',
      preferences: {},
      privateData: {},
      setTheme: (theme) => set({ theme }),
      updatePreferences: (prefs) => set({ preferences: prefs }),
    }),
    {
      namespace: 'user-session',
      apiBaseUrl: process.env.REACT_APP_HPKV_API_BASE_URL,
      tokenGenerationUrl: '/api/generate-token',
      
      // Only share theme preference, keep other data local
      publishUpdatesFor: () => ['theme'],
      subscribeToUpdatesFor: () => ['theme'],
    }
  )
);
```

### Connection Monitoring

Track connection health using reactive state:

```javascript
import { useMyStore } from './store';
import { ConnectionState } from '@hpkv/websocket-client';
function ConnectionMonitor() {
  const { multiplayer } = useMyStore((state) => state.multiplayer);
  return (
    <div>
      <p>Connected: {multiplayer.connectionState === ConnectionState.CONNECTED ? 'Yes' : 'No'}</p>
    </div>
  );
}
```

### Manual Control

Take control when needed:

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
    throttling: { enabled: true, rateLimit: 100 }
  }
}
```

## TypeScript Support

Always use `WithMultiplayer<T>` wrapper for proper typing:

```typescript
interface MyState {
  count: number;
  increment: () => void;
}

// ✅ Correct
export const useMyStore = create<WithMultiplayer<MyState>>()(
  multiplayer(/* ... */)
);

// ❌ Incorrect - missing WithMultiplayer wrapper
export const useMyStore = create<MyState>()(
  multiplayer(/* ... */)
);
```

## Documentation

- **[API Reference](./docs/API_REFERENCE.md)** - Complete API documentation
- **[Token API Guide](./docs/TOKEN_API.md)** - Authentication setup
- **[How It Works](./docs/How_It_Works.md)** - Technical deep dive

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