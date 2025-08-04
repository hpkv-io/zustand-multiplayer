# API Reference

Complete reference for the Zustand Multiplayer Middleware v0.5.0.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Types](#types)
  - [Core Types](#core-types)
  - [Configuration Types](#configuration-types)
- [Functions](#functions)
  - [`multiplayer(initializer, options)`](#multiplayerinitializer-options)
- [Multiplayer Store API](#multiplayer-store-api)
- [Configuration Options](#configuration-options)
- [Token Helper API](#token-helper-api)
- [Performance Monitoring](#performance-monitoring)
- [Connection Management](#connection-management)
- [Logging](#logging)
- [Best Practices](#best-practices)
- [Migration Guide](#migration-guide)
- [Examples](#examples)

## Quick Reference

### Essential Imports

```typescript
import { create } from 'zustand';
import {
  multiplayer,
  WithMultiplayer,
  MultiplayerOptions,
  MultiplayerState,
  LogLevel,
  Logger,
  createLogger,
  generateClientId,
} from '@hpkv/zustand-multiplayer';
import { ConnectionState } from '@hpkv/websocket-client';
```

### Basic Store Setup

```typescript
interface MyState {
  data: Record<string, any>;
  updateData: (key: string, value: any) => void;
}

const useStore = create<WithMultiplayer<MyState>>()(
  multiplayer(
    set => ({
      data: {},
      updateData: (key, value) =>
        set(state => ({
          ...state,
          data: { ...state.data, [key]: value },
        })),
    }),
    {
      namespace: 'my-app',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
    },
  ),
);
```

### Token Generation

```typescript
// pages/api/generate-token.ts
import { TokenHelper } from '@hpkv/zustand-multiplayer/auth/token-helper';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);

export default async function handler(req, res) {
  try {
    const response = await tokenHelper.processTokenRequest(req.body);
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

## Types

### Core Types

#### `WithMultiplayer<T>`

Wrapper type that adds multiplayer functionality to your state type.

```typescript
type WithMultiplayer<S> = S & { multiplayer: MultiplayerState };
```

**Usage:**

```typescript
interface MyState {
  count: number;
  increment: () => void;
}

// Use WithMultiplayer wrapper
const useStore = create<WithMultiplayer<MyState>>()(multiplayer(/* ... */));
```

#### `MultiplayerState`

State properties added to your store by the multiplayer middleware.

```typescript
interface MultiplayerState {
  connectionState: ConnectionState; // Current connection state
  hasHydrated: boolean; // Whether initial hydration completed
  performanceMetrics: PerformanceMetrics; // Performance statistics
}
```

#### `MultiplayerStoreApi<S>`

Enhanced store API with multiplayer methods.

```typescript
type MultiplayerStoreApi<S> = StoreApi<S> & {
  multiplayer: {
    reHydrate: () => Promise<void>; // Force hydration from server
    clearStorage: () => Promise<void>; // Clear all stored data
    disconnect: () => Promise<void>; // Disconnect from server
    connect: () => Promise<void>; // Connect to server
    destroy: () => Promise<void>; // Cleanup all resources
    getConnectionStatus: () => ConnectionStats | null; // Get connection info
    getMetrics: () => PerformanceMetrics; // Get performance metrics
  };
};
```

**Note:** Access these methods via `store.multiplayer`, not through state:

```typescript
// Correct usage
const store = useStore;
await store.multiplayer.reHydrate();
const metrics = store.multiplayer.getMetrics();

// Not through state
// store.getState().multiplayer.reHydrate() // ❌ Wrong
```

#### `ConnectionState`

Enum representing the current connection status (from `@hpkv/websocket-client`):

```typescript
enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
}
```

#### `ConnectionStats`

Detailed connection information:

```typescript
interface ConnectionStats {
  isConnected: boolean;
  connectionState: ConnectionState;
  reconnectAttempts: number;
  messagesPending: number;
  throttling?: {
    currentRate: number;
    queueLength: number;
  };
}
```

#### `PerformanceMetrics`

Performance monitoring data:

```typescript
interface PerformanceMetrics {
  averageSyncTime: number; // Average time for sync operations (ms)
}
```

### Configuration Types

#### `MultiplayerOptions<TState>`

Configuration options for the multiplayer middleware.

```typescript
interface MultiplayerOptions<TState> {
  // Required
  namespace: string; // Unique identifier for your store
  apiBaseUrl: string; // HPKV API base URL

  // Authentication (choose one)
  apiKey?: string; // For server-side usage
  tokenGenerationUrl?: string; // For client-side usage

  // Selective synchronization
  sync?: Array<keyof TState>; // Fields to synchronize (default: all non-function fields)

  // Storage granularity
  zFactor?: number; // Granularity depth (0-10, default: 2)

  // Configuration
  logLevel?: LogLevel; // Logging verbosity
  rateLimit?: number; // Messages per second limit
}
```

#### `LogLevel`

Logging verbosity levels:

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}
```

## Functions

### `multiplayer(initializer, options)`

The main middleware function that wraps your Zustand state creator.

**Signature:**

```typescript
function multiplayer<T>(
  initializer: StateCreator<T, [], [], Omit<T, 'multiplayer'>>,
  options: MultiplayerOptions<Omit<T, 'multiplayer'>>,
): StateCreator<WithMultiplayer<T>, [], []>;
```

**Parameters:**

- `initializer`: Your Zustand state creator function
- `options`: Configuration object (see [Configuration Options](#configuration-options))

**Returns:** A Zustand-compatible state creator with multiplayer functionality

**Example:**

```typescript
const useStore = create<WithMultiplayer<MyState>>()(
  multiplayer(
    (set, get) => ({
      count: 0,
      todos: {},
      increment: () =>
        set(state => ({
          count: state.count + 1,
        })),
      addTodo: (text: string) =>
        set(state => {
          const id = Date.now().toString();
          return {
            todos: {
              ...state.todos,
              [id]: { id, text, completed: false },
            },
          };
        }),
    }),
    {
      namespace: 'my-app',
      apiBaseUrl: 'https://api.hpkv.io',
      tokenGenerationUrl: '/api/generate-token',
      zFactor: 2, // Configure storage granularity (0-10, default: 2)
    },
  ),
);
```

**State Update Patterns:**

The multiplayer middleware supports standard Zustand state update patterns:

```typescript
// Direct state object
set({ count: 5 });

// Partial state update
set(state => ({ count: state.count + 1 }));

// Functional update
set(state => ({
  ...state,
  todos: {
    ...state.todos,
    [id]: newTodo,
  },
}));
```

## Multiplayer Store API

Access multiplayer methods via the store's `multiplayer` property:

```typescript
const store = useStore; // Your store reference
```

### `reHydrate(): Promise<void>`

Manually triggers state synchronization from the server.

```typescript
await store.multiplayer.reHydrate();
```

**Use cases:**

- Force refresh after suspected desync
- Manual sync after reconnection
- Initial load optimization

### `clearStorage(): Promise<void>`

Removes all data associated with the store's namespace from HPKV.

```typescript
await store.multiplayer.clearStorage();
```

**⚠️ Warning:** This affects all clients using the same namespace.

### `connect(): Promise<void>`

Manually establishes connection to HPKV.

```typescript
await store.multiplayer.connect();
```

**Note:** Connection is usually automatic. Use for manual reconnection scenarios.

### `disconnect(): Promise<void>`

Closes the WebSocket connection.

```typescript
await store.multiplayer.disconnect();
```

**Note:** Automatic reconnection may still occur based on configuration.

### `destroy(): Promise<void>`

Permanently destroys the multiplayer instance and cleans up resources.

```typescript
await store.multiplayer.destroy();
```

**Use cases:**

- Component unmounting
- Store cleanup
- Memory management

### `getConnectionStatus(): ConnectionStats | null`

Returns detailed connection information.

```typescript
const status = store.multiplayer.getConnectionStatus();
if (status?.isConnected) {
  console.log('Connected with', status.reconnectAttempts, 'reconnect attempts');
}
```

### `getMetrics(): PerformanceMetrics`

Returns performance monitoring data.

```typescript
const metrics = store.multiplayer.getMetrics();
console.log('Average sync time:', metrics.averageSyncTime.toFixed(1) + 'ms');
```

## Configuration Options

### Required Options

#### `namespace: string`

Unique identifier for your store's data in HPKV.

```typescript
{
  namespace: 'my-app-v1'; // All keys prefixed with 'my-app-v1:'
}
```

**Best practices:**

- Use descriptive names
- Include version for schema changes
- Avoid special characters

#### `apiBaseUrl: string`

Your HPKV API base URL from the dashboard.

```typescript
{
  apiBaseUrl: 'https://api.hpkv.io'; // From HPKV dashboard
}
```

### Authentication Options

Choose one based on your environment:

#### `apiKey?: string` (Server-side)

Your HPKV API key for server-side stores.

```typescript
{
  apiKey: process.env.HPKV_API_KEY; // Keep secret!
}
```

#### `tokenGenerationUrl?: string` (Client-side)

URL of your token generation endpoint.

```typescript
{
  tokenGenerationUrl: '/api/generate-token';
}
```

### Selective Synchronization

#### `sync?: Array<keyof TState>`

Controls which state fields are synchronized.

```typescript
{
  sync: ['todos', 'settings']; // Only sync these fields
}
```

**Default:** All non-function properties

### Storage Granularity

#### `zFactor?: number`

Controls the depth level for granular storage optimization. This option determines how deeply the middleware traverses nested objects when storing state changes.

```typescript
{
  zFactor: 2; // Default: store at depth 2
}
```

**Range:** 0-10 (default: 2)

**Behavior by value:**

- **zFactor: 0** - Each top-level property gets its own storage key
- **zFactor: 1** - Properties at depth 2 get their own keys
- **zFactor: 2** - Properties at depth 3 get their own keys (default)
- **zFactor: 3-10** - Store at specified depth for deeply nested data

**Example with zFactor: 0:**

```typescript
// Storage keys created:
// namespace-1:user -> { "profile": {...}, "preferences": {...} }
// namespace-1:todos -> { "1": {...} }
```

**Example with zFactor: 1:**

```typescript
// Storage keys created:
// namespace-2:user:profile -> { "name": "John", "email": "john@example.com" }
// namespace-2:user:preferences -> { "theme": "dark" }
// namespace-2:todos:1 -> { "id": "1", "text": "Buy milk", "completed": false }
```

**Performance considerations:**

- **Lower zFactor (0-2)**: Fewer keys, better for atomic state changes
- **Higher zFactor (3+)**: More granular storage, better for collaborative editing of nested data

### Performance & Debugging

#### `logLevel?: LogLevel`

Controls logging verbosity.

```typescript
{
  logLevel: LogLevel.INFO; // DEBUG, INFO, WARN, ERROR, NONE
}
```

#### `rateLimit?: number`

Limits the number of messages sent per second. Adjust this based on the rate limit of you HPKV plan. For free tier, it's 10 req/s.

```typescript
{
  rateLimit: 10; // Max 10 messages per second
}
```

## Token Helper API

The `TokenHelper` class is available for server-side token generation but must be imported directly:

```typescript
import { TokenHelper } from '@hpkv/zustand-multiplayer';
```

### `TokenHelper`

Utility class for generating HPKV tokens in your backend.

#### Constructor

```typescript
new TokenHelper(apiKey: string, baseUrl: string)
```

#### Methods

##### `generateTokenForStore(namespace: string, subscribedKeysAnPatterns: string[]): Promise<string>`

Generates a WebSocket token for a specific namespace.

```typescript
const tokenHelper = new TokenHelper(apiKey, baseUrl);
const token = await tokenHelper.generateTokenForStore('my-app', ['my-app:todos', 'my-app:*']);
```

**Parameters:**

- `namespace`: The store namespace
- `subscribedKeysAnPatterns`: Array of keys and patterns to subscribe to (supports wildcards with `*`)

##### `processTokenRequest(requestData: unknown): Promise<TokenResponse>`

Processes a token request and returns a structured response.

```typescript
const response = await tokenHelper.processTokenRequest(req.body);
// Returns: { namespace: 'my-app', token: 'eyJ...' }
```

### Token Interfaces

```typescript
interface TokenRequest {
  /** Store name to generate token for */
  namespace: string;
  /** Keys and patterns to subscribe to */
  subscribedKeysAndPatterns: string[];
}

interface TokenResponse {
  /** The namespace the token is for */
  namespace: string;
  /** The generated WebSocket token */
  token: string;
}
```

## Performance Monitoring

### Metrics Collection

Performance metrics are automatically collected and accessible via the store API:

```typescript
const metrics = store.multiplayer.getMetrics();
```

### Available Metrics

```typescript
interface PerformanceMetrics {
  averageSyncTime: number; // Average sync operation time (ms)
}
```

### Usage Example

```typescript
function PerformanceMonitor() {
  const { performanceMetrics } = useStore(state => state.multiplayer);

  return (
    <div>
      <p>Avg Sync Time: {performanceMetrics.averageSyncTime.toFixed(1)}ms</p>
    </div>
  );
}
```

## Connection Management

### Connection States

Connection states are imported from `@hpkv/websocket-client`:

```typescript
import { ConnectionState } from '@hpkv/websocket-client';

enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
}
```

### Connection Statistics

```typescript
interface ConnectionStats {
  connectionState: ConnectionState;
  isConnected: boolean;
  reconnectAttempts: number;
  messagesPending: number;
  throttling?: {
    currentRate: number;
    queueLength: number;
  };
}
```

### Monitoring Connection

```typescript
function ConnectionStatus() {
  const connectionState = useStore(state => state.multiplayer.connectionState);
  const status = useStore.multiplayer.getConnectionStatus();

  return (
    <div>
      <div>State: {connectionState}</div>
      {status && (
        <div>
          <div>Reconnect Attempts: {status.reconnectAttempts}</div>
          <div>Pending Messages: {status.messagesPending}</div>
        </div>
      )}
    </div>
  );
}
```

## Logging

### LogLevel Enum

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}
```

### Usage

```typescript
import { LogLevel } from '@hpkv/zustand-multiplayer';

{
  logLevel: LogLevel.DEBUG; // Enable all logging
}
```

### Custom Logger

You can create a custom logger instance:

```typescript
import { createLogger, LogLevel } from '@hpkv/zustand-multiplayer';

const logger = createLogger(LogLevel.INFO);
logger.info('Application started');
logger.error('An error occurred', error);
```

## Best Practices

### TypeScript Usage

Always use the `WithMultiplayer<T>` wrapper:

```typescript
// ✅ Correct
const useStore = create<WithMultiplayer<MyState>>()(multiplayer(/* ... */));

// ❌ Incorrect
const useStore = create<MyState>()(multiplayer(/* ... */));
```

### State Updates

Use standard Zustand patterns for state updates:

```typescript
// ✅ Functional update
set(state => ({
  todos: { ...state.todos, [id]: newTodo },
}));

// ✅ Direct update
set({ count: 5 });
```

### Error Handling

Wrap multiplayer operations in try-catch blocks:

```typescript
try {
  await store.multiplayer.reHydrate();
} catch (error) {
  console.error('Hydration failed:', error);
}
```

### Performance Optimization

1. **Use selective sync** for large states to reduce bandwidth
2. **Choose appropriate zFactor** based on your data structure
3. **Monitor metrics** in production for insights
4. **Set rate limits** to prevent overwhelming the server

### Security

1. **Never expose API keys** in client code
2. **Validate tokens** in your backend
3. **Implement authentication/authorization** for token endpoints
4. **Use HTTPS** for all API communications
