# API Reference

Complete reference for the Zustand Multiplayer Middleware.

## Table of Contents

- [Types](#types)
  - [Core Types](#core-types)
  - [Configuration Types](#configuration-types)
  - [Utility Types](#utility-types)
- [Functions](#functions)
  - [`multiplayer(initializer, options)`](#multiplayerinitializer-options)
- [Multiplayer State API](#multiplayer-state-api)
- [Configuration Options](#configuration-options)
- [Token Helper API](#token-helper-api)
- [Error Types](#error-types)
- [Performance Monitoring](#performance-monitoring)

## Exports

The main package exports the following:

```typescript
// Core multiplayer functionality
export { multiplayer, MultiplayerOptions, WithMultiplayer } from './multiplayer';

// Token generation utilities
export { TokenHelper, TokenRequest, TokenResponse } from './token-helper';

// Storage interface
export { HPKVStorage } from './hpkvStorage';

// Logging utilities
export * from './logger';
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

Interface for the `multiplayer` object added to your store.

```typescript
interface MultiplayerState {
  connectionState: ConnectionState; // Current connection state
  hasHydrated: boolean; // Whether initial hydration completed

  // Methods
  hydrate: () => Promise<void>; // Force hydration from server
  clearStorage: () => Promise<void>; // Clear all stored data
  disconnect: () => Promise<void>; // Disconnect from server
  connect: () => Promise<void>; // Connect to server
  destroy: () => Promise<void>; // Cleanup all resources
  getConnectionStatus: () => ConnectionStats | null; // Get connection info
  getMetrics: () => PerformanceMetrics; // Get performance metrics
}
```

#### `ConnectionState`

Enum representing the current connection status:

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
  stateChangesProcessed: number;
  averageHydrationTime: number;
  averageSyncTime: number;
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
  publishUpdatesFor?: () => Array<keyof TState>; // Fields to publish
  subscribeToUpdatesFor?: () => Array<keyof TState>; // Fields to subscribe to

  // Lifecycle hooks
  onHydrate?: (state: TState) => void;
  onConflict?: (conflicts: ConflictInfo<TState>[]) => ConflictResolution<TState>;

  // Configuration
  logLevel?: LogLevel; // Logging verbosity
  profiling?: boolean; // Enable performance metrics
  retryConfig?: RetryConfig; // Retry configuration
  clientConfig?: ConnectionConfig; // WebSocket client config
}
```

#### `ConflictInfo<TState>`

Information about a single conflict.

```typescript
interface ConflictInfo<TState> {
  field: keyof TState; // The conflicted field
  localValue: unknown; // Value before disconnection
  remoteValue: unknown; // Current server value
  pendingValue: unknown; // Your pending change
}
```

#### `ConflictResolution<TState>`

Resolution strategy for conflicts.

```typescript
interface ConflictResolution<TState> {
  strategy: ConflictStrategy;
  mergedValues?: Partial<TState>; // Required if strategy is 'merge'
}

type ConflictStrategy = 'keep-remote' | 'keep-local' | 'merge';
```

#### `RetryConfig`

Configuration for retry behavior:

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}
```

#### `LogLevel`

Logging verbosity levels:

```typescript
enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}
```

### Utility Types

#### `TokenRequest`

Request format for token generation endpoints:

```typescript
interface TokenRequest {
  namespace: string;
  subscribedKeys: string[];
}
```

#### `TokenResponse`

Response format from token generation endpoints:

```typescript
interface TokenResponse {
  namespace: string;
  token: string;
}
```

## Functions

### `multiplayer(initializer, options)`

The main middleware function that wraps your Zustand state creator.

**Signature:**

```typescript
function multiplayer<T>(
  initializer: StateCreator<T, [], []>,
  options: MultiplayerOptions<T>,
): StateCreator<T & { multiplayer: MultiplayerState }, [], []>;
```

**Parameters:**

- `initializer`: Your standard Zustand state creator function
- `options`: Configuration object (see [Configuration Options](#configuration-options))

**Returns:** A Zustand-compatible state creator with multiplayer functionality

**Example:**

```typescript
const useStore = create<WithMultiplayer<MyState>>()(
  multiplayer(
    (set, get) => ({
      count: 0,
      increment: () => set(state => ({ count: state.count + 1 })),
    }),
    {
      namespace: 'my-app',
      apiBaseUrl: 'https://api.hpkv.io',
      tokenGenerationUrl: '/api/generate-token',
    },
  ),
);
```

## Multiplayer State API

### `hydrate(): Promise<void>`

Manually triggers state synchronization from the server.

```typescript
await store.getState().multiplayer.hydrate();
```

**Use cases:**

- Force refresh after suspected desync
- Manual sync after reconnection
- Initial load optimization

### `clearStorage(): Promise<void>`

Removes all data associated with the store's namespace from HPKV.

```typescript
await store.getState().multiplayer.clearStorage();
```

**⚠️ Warning:** This affects all clients using the same namespace.

### `connect(): Promise<void>`

Manually establishes connection to HPKV.

```typescript
await store.getState().multiplayer.connect();
```

**Note:** Connection is usually automatic. Use for manual reconnection scenarios.

### `disconnect(): Promise<void>`

Closes the WebSocket connection.

```typescript
await store.getState().multiplayer.disconnect();
```

**Note:** Automatic reconnection may still occur based on configuration.

### `destroy(): Promise<void>`

Permanently destroys the multiplayer instance and cleans up resources.

```typescript
await store.getState().multiplayer.destroy();
```

**Use cases:**

- Component unmounting
- Store cleanup
- Memory management

### `getConnectionStatus(): ConnectionStats | null`

Returns detailed connection information.

```typescript
const status = store.getState().multiplayer.getConnectionStatus();
if (status?.isConnected) {
  console.log('Connected with', status.reconnectAttempts, 'reconnect attempts');
}
```

### `getMetrics(): PerformanceMetrics`

Returns performance monitoring data.

```typescript
const metrics = store.getState().multiplayer.getMetrics();
console.log('State changes processed:', metrics.stateChangesProcessed);
console.log('Average hydration time:', metrics.averageHydrationTime.toFixed(1) + 'ms');
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

## Configuration Details

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

#### `publishUpdatesFor?: () => Array<keyof TState>`

Controls which state changes are sent to other clients.

```typescript
{
  publishUpdatesFor: () => ['todos', 'settings']; // Only sync these fields
}
```

**Default:** All non-function properties

#### `subscribeToUpdatesFor?: () => Array<keyof TState>`

Controls which remote changes this client receives.

```typescript
{
  subscribeToUpdatesFor: () => ['todos', 'users']; // Only receive these fields
}
```

**Default:** All non-function properties

### Lifecycle Hooks

#### `onHydrate?: (state: TState) => void`

Called after initial state hydration from HPKV.

```typescript
{
  onHydrate: state => {
    console.log('Hydrated with', Object.keys(state).length, 'properties');
    // Initialize UI, trigger analytics, etc.
  };
}
```

#### `onConflict?: (conflicts: ConflictInfo<TState>[]) => ConflictResolution<TState>`

Custom conflict resolution strategy.

```typescript
{
  onConflict: conflicts => {
    // Log conflicts for debugging
    console.log('Resolving', conflicts.length, 'conflicts');

    // Custom merge logic
    const contentConflict = conflicts.find(c => c.field === 'content');
    if (contentConflict) {
      return {
        strategy: 'merge',
        mergedValues: {
          content: `${contentConflict.remoteValue}\n---\n${contentConflict.localValue}`,
        },
      };
    }

    // Default: prefer remote
    return { strategy: 'keep-remote' };
  };
}
```

**Available strategies:**

- `keep-remote`: Use server state (default)
- `keep-local`: Use local changes
- `merge`: Custom merge with `mergedValues`

### Performance & Debugging

#### `logLevel?: LogLevel`

Controls logging verbosity.

```typescript
{
  logLevel: LogLevel.INFO; // NONE, ERROR, WARN, INFO, DEBUG
}
```

#### `profiling?: boolean`

Enables performance profiling.

```typescript
{
  profiling: true; // Collect detailed metrics
}
```

#### `retryConfig?: RetryConfig`

Customizes retry behavior for failed operations.

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}
```

Example:

```typescript
{
  retryConfig: {
    maxRetries: 5,
    baseDelay: 1000,      // 1 second
    maxDelay: 30000,      // 30 seconds
    backoffFactor: 2      // Exponential backoff
  }
}
```

#### `clientConfig?: ConnectionConfig`

Advanced WebSocket client configuration from `@hpkv/websocket-client`.

```typescript
{
  clientConfig: {
    maxReconnectAttempts: 10,
    throttling: {
      enabled: true,
      rateLimit: 100        // Messages per second
    }
  }
}
```

## Conflict Resolution

### `ConflictInfo<TState>`

Information about a single conflict.

```typescript
interface ConflictInfo<TState> {
  field: keyof TState; // The conflicted field
  localValue: unknown; // Value before disconnection
  remoteValue: unknown; // Current server value
  pendingValue: unknown; // Your pending change
}
```

### `ConflictResolution<TState>`

Resolution strategy for conflicts.

```typescript
interface ConflictResolution<TState> {
  strategy: ConflictStrategy;
  mergedValues?: Partial<TState>; // Required if strategy is 'merge'
}

type ConflictStrategy = 'keep-remote' | 'keep-local' | 'merge';
```

## Token Helper API

### `TokenHelper`

Utility class for generating HPKV tokens in your backend.

#### Constructor

```typescript
new TokenHelper(apiKey: string, baseUrl: string)
```

#### Methods

##### `generateTokenForStore(namespace: string, subscribedKeys: string[]): Promise<string>`

Generates a WebSocket token for a specific namespace.

```typescript
const tokenHelper = new TokenHelper(apiKey, baseUrl);
const token = await tokenHelper.generateTokenForStore('my-app', ['my-app:todos']);
```

##### `processTokenRequest(requestData: unknown): Promise<TokenResponse>`

Processes a token request and returns a structured response.

```typescript
const response = await tokenHelper.processTokenRequest(req.body);
// Returns: { namespace: 'my-app', token: 'eyJ...' }
```

##### Framework Handlers

Pre-built handlers for popular frameworks:

```typescript
// Express
app.post('/api/token', tokenHelper.createExpressHandler());

// Next.js
export default tokenHelper.createNextApiHandler();

// Fastify
fastify.post('/api/token', tokenHelper.createFastifyHandler());
```

### Token Interfaces

```typescript
interface TokenRequest {
  namespace: string;
  subscribedKeys: string[];
}

interface TokenResponse {
  namespace: string;
  token: string;
}
```

## Error Types

### `MultiplayerError`

Base error class for multiplayer-related errors.

```typescript
class MultiplayerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly context?: Record<string, unknown>
  )
}
```

### `HydrationError`

Specific error for hydration failures.

```typescript
class HydrationError extends MultiplayerError {
  constructor(message: string, context?: Record<string, unknown>);
}
```

**Common error codes:**

- `CONNECTION_FAILED`: WebSocket connection failed
- `AUTHENTICATION_FAILED`: Token generation/validation failed
- `HYDRATION_ERROR`: State hydration failed
- `SYNC_ERROR`: State synchronization failed
- `MISSING_AUTHENTICATION_CONFIG`: No apiKey or tokenGenerationUrl provided

## Performance Monitoring

### Metrics Collection

Enable profiling to collect detailed metrics:

```typescript
{
  profiling: true;
}
```

### Available Metrics

```typescript
interface PerformanceMetrics {
  stateChangesProcessed: number; // Total state changes handled
  averageHydrationTime: number; // Average hydration time (ms)
  averageSyncTime: number; // Average sync operation time (ms)
}
```

### Usage Example

```typescript
function PerformanceMonitor() {
  const metrics = useStore(state => state.multiplayer.getMetrics());

  return (
    <div>
      <p>Changes Processed: {metrics.stateChangesProcessed}</p>
      <p>Avg Hydration: {metrics.averageHydrationTime.toFixed(1)}ms</p>
      <p>Avg Sync Time: {metrics.averageSyncTime.toFixed(1)}ms</p>
    </div>
  );
}
```

## Connection Management

### Connection States

Connection states are imported from `@hpkv/websocket-client`:

```typescript
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}
```

### Connection Statistics

```typescript
interface ConnectionStats {
  connectionState: ConnectionState;
  isConnected: boolean;
  reconnectAttempts: number;
  lastError?: string;
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

## Best Practices

### TypeScript Usage

Always use the `WithMultiplayer<T>` wrapper:

```typescript
// ✅ Correct
const useStore = create<WithMultiplayer<MyState>>()(multiplayer(/* ... */));

// ❌ Incorrect
const useStore = create<MyState>()(multiplayer(/* ... */));
```

### Error Handling

Wrap multiplayer operations in try-catch blocks:

```typescript
try {
  await store.getState().multiplayer.hydrate();
} catch (error) {
  if (error instanceof HydrationError) {
    // Handle hydration-specific errors
    console.error('Hydration failed:', error.message);
  }
}
```

### Performance Optimization

1. **Use selective sync** for large states to reduce bandwidth
2. **Enable profiling** in development to track performance
3. **Monitor metrics** in production for insights
4. **Configure retry policies** and connection settings for your use case

### Security

1. **Never expose API keys** in client code
2. **Validate tokens** in your backend
3. **Use HTTPS** for token endpoints
4. **Implement rate limiting** on token generation
