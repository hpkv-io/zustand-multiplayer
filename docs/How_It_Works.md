# How It Works

The Zustand Multiplayer Middleware provides real-time state synchronization by integrating Zustand's state management with HPKV's WebSocket-based messaging and persistence infrastructure.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Zustand       │    │   Multiplayer    │    │     HPKV        │
│   Store         │◄──►│   Middleware     │◄──►│   Backend       │
│                 │    │                  │    │                 │
│ • State         │    │ • Orchestrator   │    │ • WebSocket     │
│ • Actions       │    │ • Conflict Res.  │    │ • Persistence   │
│ • Subscriptions │    │ • Sync Queue     │    │ • Pub/Sub       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Core Components

### 1. MultiplayerOrchestrator (`src/multiplayer.ts`)

The central coordinator that manages all multiplayer functionality:

- **State Hydration**: Fetches initial state from HPKV on connection
- **Change Detection**: Intercepts Zustand state changes
- **Sync Management**: Queues and processes state updates
- **Connection Handling**: Manages WebSocket lifecycle
- **Conflict Resolution**: Handles simultaneous edits

### 2. HPKVStorage (`src/hpkvStorage.ts`)

Provides the storage and communication layer:

- **WebSocket Management**: Maintains persistent connection to HPKV
- **Key-Value Operations**: Handles get/set operations with namespacing
- **Event Streaming**: Subscribes to real-time change notifications
- **Token Management**: Handles authentication and token refresh

### 3. ConflictResolver (`src/conflictResolver.ts`)

Manages conflicts when multiple clients edit the same data:

- **Detection**: Identifies conflicting changes during reconnection
- **Resolution Strategies**: Implements keep-local, keep-remote, and merge strategies
- **Custom Handlers**: Supports user-defined conflict resolution logic

### 4. SyncQueueManager

Manages pending changes during disconnections:

- **Queue Management**: Stores changes when offline
- **Batch Processing**: Efficiently syncs multiple changes
- **Conflict Detection**: Identifies potential conflicts before applying

## Data Flow

### Initialization Sequence

1. **Store Creation**

   ```typescript
   const store = create(multiplayer(stateCreator, options));
   ```

2. **Authentication**

   - Client-side: Fetches token from `tokenGenerationUrl`
   - Server-side: Uses `apiKey` directly

3. **Connection Establishment**

   - Creates WebSocket connection to HPKV
   - Subscribes to namespace-specific events

4. **State Hydration**
   - Fetches existing state from HPKV
   - Merges with initial state
   - Triggers `onHydrate` callback

### State Change Propagation

```
Local Change → Middleware → HPKV → Other Clients → Remote Update
     ↓              ↓         ↓          ↓             ↓
  set({...})    Intercept   Persist   Broadcast    Apply Change
```

1. **Local State Change**

   ```typescript
   store.getState().increment(); // Triggers set()
   ```

2. **Middleware Interception**

   - Detects change via Zustand's `set` function
   - Filters based on `publishUpdatesFor` configuration
   - Adds to sync queue

3. **HPKV Persistence**

   - Sends change to HPKV via WebSocket
   - Data persisted with namespace prefix: `namespace:key`

4. **Real-time Broadcast**

   - HPKV broadcasts to all subscribed clients
   - Filtered by `subscribeToUpdatesFor` configuration

5. **Remote Application**
   - Receiving clients apply changes to local state
   - Conflict resolution if needed
   - UI updates automatically via Zustand

### Conflict Resolution Flow

```
Reconnection → Fetch Remote → Compare Local → Resolve → Apply
     ↓              ↓             ↓           ↓        ↓
  Connect      Get Latest    Find Diffs   Strategy  Update
```

1. **Conflict Detection**

   - Occurs during reconnection after offline period
   - Compares local pending changes with remote state

2. **Resolution Strategy**

   ```typescript
   onConflict: conflicts => ({
     strategy: 'merge',
     mergedValues: {
       /* custom merge logic */
     },
   });
   ```

3. **Application**
   - Resolved values applied to local state
   - Conflicts logged for debugging

## Key Features

### Selective Synchronization

Control which state properties are synchronized:

```typescript
{
  publishUpdatesFor: () => ['todos', 'settings'],    // Only send these
  subscribeToUpdatesFor: () => ['todos', 'users'],   // Only receive these
}
```

**Benefits:**

- Reduced bandwidth usage
- Privacy control (keep sensitive data local)
- Performance optimization

### Namespace Isolation

Each store operates in its own namespace:

```typescript
// These stores don't interfere with each other
const todoStore = create(multiplayer(/* ... */, { namespace: 'todos' }))
const chatStore = create(multiplayer(/* ... */, { namespace: 'chat' }))
```

**Key Structure:**

```
HPKV Storage:
├── todos:items          // Todo list data
├── todos:filter         // Todo filter state
├── chat:messages        // Chat messages
└── chat:users          // Online users
```

### Performance Optimizations

1. **Token Caching**: Authentication tokens cached to avoid regeneration
2. **Batch Updates**: Multiple changes sent together when possible
3. **Throttling**: Rate limiting for high-frequency updates
4. **Connection Management**: Efficient WebSocket connection handling
5. **Incremental Updates**: Only send changed data, not full state

### Error Handling & Resilience

1. **Automatic Reconnection**: Exponential backoff strategy
2. **Offline Queue**: Changes stored during disconnection
3. **Retry Logic**: Failed operations automatically retried
4. **Graceful Degradation**: Works offline, syncs when reconnected

## Security Model

### Authentication Flow

```
Client → Token Endpoint → HPKV Token → WebSocket Connection
   ↓           ↓              ↓              ↓
Request    Generate       Validate       Establish
```

1. **Token Generation**

   - Client requests token from your backend
   - Backend validates user and generates HPKV token
   - Token includes namespace access permissions

2. **Connection Security**

   - All communication over WSS (WebSocket Secure)
   - Tokens expire automatically (2 hours)
   - Automatic token refresh

3. **Access Control**
   - Namespace-based isolation
   - Key-level permissions via token configuration
   - No cross-namespace access

## Performance Characteristics

### Metrics Available

The middleware provides performance monitoring when `profiling: true`:

```typescript
interface PerformanceMetrics {
  stateChangesProcessed: number; // Total state changes handled
  averageHydrationTime: number; // Average hydration time (ms)
  averageSyncTime: number; // Average sync operation time (ms)
}
```

### Example Usage

```typescript
function PerformanceMonitor() {
  const metrics = useStore(state => state.multiplayer.getMetrics());

  return (
    <div>
      <p>State Changes: {metrics.stateChangesProcessed}</p>
      <p>Avg Hydration: {metrics.averageHydrationTime?.toFixed(1)}ms</p>
      <p>Avg Sync: {metrics.averageSyncTime?.toFixed(1)}ms</p>
    </div>
  );
}
```

## Debugging & Monitoring

### Built-in Metrics

```typescript
const metrics = store.getState().multiplayer.getMetrics();
// Returns: {
//   stateChangesProcessed: number,
//   averageHydrationTime: number,
//   averageSyncTime: number
// }
```

### Connection Status

```typescript
const status = store.getState().multiplayer.getConnectionStatus();
// Returns: {
//   isConnected: boolean,
//   connectionState: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING',
//   reconnectAttempts: number,
//   messagesPending: number
// }
```

### Logging

```typescript
{
  logLevel: LogLevel.DEBUG, // NONE, ERROR, WARN, INFO, DEBUG
  profiling: true           // Enable performance profiling
}
```

### Cross-Platform Sync

The same namespace can be shared across:

- Web applications (React, Vue, Angular)
- Mobile apps (React Native, Flutter)
- Desktop applications (Electron, Tauri)
- Server-side processes (Node.js, Deno)

This enables true cross-platform real-time synchronization with a single codebase pattern.
