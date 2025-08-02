# API Reference

Complete reference for the Zustand Multiplayer Middleware v0.5.0.

## Table of Contents

- [Quick Reference](#quick-reference)
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
- [Migration Guide](#migration-guide)
- [Examples](#examples)

## Quick Reference

### Essential Imports

```typescript
import { create } from 'zustand';
import {
  multiplayer,
  WithMultiplayer,
  TokenHelper,
  LogLevel,
  MultiplayerError,
  HydrationError,
  TokenGenerationError,
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
        set(state => {
          state.data[key] = value;
        }),
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
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);

export default tokenHelper.createNextApiHandler();
```

## Exports

The main package exports the following:

```typescript
// Core multiplayer functionality
export { multiplayer } from './multiplayer';
export type {
  MultiplayerOptions,
  WithMultiplayer,
  MultiplayerState,
} from './types/multiplayer-types';

// Token generation utilities
export { TokenHelper, TokenRequest, TokenResponse } from './auth/token-helper';

// Storage interface
export { HPKVStorage } from './storage/hpkv-storage';
export { StorageKeyManager } from './storage/storage-key-manager';

// Logging utilities
export * from './monitoring/logger';

// Utility functions
export * from './utils';
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

#### `ImmerStateCreator<T>`

Enhanced state creator that supports Immer-style mutations:

```typescript
type ImmerStateCreator<
  T,
  Mis extends [StoreMutatorIdentifier, unknown][] = [],
  Mos extends [StoreMutatorIdentifier, unknown][] = [],
  U = T,
> = (
  setState: (partial: T | Partial<T> | ((state: Draft<T>) => void), replace?: boolean) => void,
  getState: () => T,
  store: {
    setState: (partial: T | Partial<T> | ((state: Draft<T>) => void), replace?: boolean) => void;
    getState: () => T;
    subscribe: (listener: (state: T, prevState: T) => void) => () => void;
  },
) => U;
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

  // Storage granularity
  zFactor?: number; // Granularity depth (0-10, default: 2)

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
  /** Store name to generate token for */
  namespace: string;
  /** Keys and patterns to subscribe to */
  subscribedKeysAndPatterns: string[];
}
```

#### `TokenResponse`

Response format from token generation endpoints:

```typescript
interface TokenResponse {
  /** The namespace the token is for */
  namespace: string;
  /** The generated WebSocket token */
  token: string;
}
```

#### `SerializableValue`

Type for values that can be safely serialized and stored:

```typescript
type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SerializableValue[]
  | { [key: string]: SerializableValue };
```

#### `PathExtractable`

Type constraint for state that can have paths extracted:

```typescript
type PathExtractable = Record<string, SerializableValue>;
```

## Functions

### `multiplayer(initializer, options)`

The main middleware function that wraps your Zustand state creator with Immer support.

**Signature:**

```typescript
function multiplayer<T>(
  initializer: ImmerStateCreator<T, [], [], T>,
  options: MultiplayerOptions<T>,
): StateCreator<T & { multiplayer: MultiplayerState }, [], []>;
```

**Parameters:**

- `initializer`: Your Zustand state creator function with Immer support
- `options`: Configuration object (see [Configuration Options](#configuration-options))

**Returns:** A Zustand-compatible state creator with multiplayer functionality

**Example:**

```typescript
const useStore = create<WithMultiplayer<MyState>>()(
  multiplayer(
    (set, get) => ({
      count: 0,
      todos: {},
      // Immer-style updates with arrow functions
      increment: () =>
        set(state => {
          state.count += 1;
        }),
      addTodo: (text: string) =>
        set(state => {
          const id = Date.now().toString();
          state.todos[id] = { id, text, completed: false };
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

**State Update Types:**

The multiplayer middleware supports multiple state update patterns:

```typescript
// Direct state object
set({ count: 5 });

// Partial state update
set(state => ({ count: state.count + 1 }));

// Immer-style mutations (arrow functions)
set(state => {
  state.count += 1;
  state.todos[id] = newTodo;
});

// Changes and deletions format
set({
  changes: { count: 5 },
  deletions: [{ path: ['todos', 'old-id'] }],
});
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

### Storage Granularity

#### `zFactor?: number`

Controls the depth level for granular storage optimization. This option determines how deeply the middleware traverses nested objects when storing state changes.

```typescript
{
  zFactor: 1; // Default: store each top-level property separately
}
```

**Range:** 0-10 (default: 1)

**Behavior by value:**

- **zFactor: 0** - Store entire state in a single key (atomic updates)
- **zFactor: 1** - Each top-level property gets its own storage key (default)
- **zFactor: 2** - Properties at depth 2 get their own keys
- **zFactor: 3-10** - Store at specified depth: More granular storage for deeply nested data

**Example with zFactor: 0:**

```typescript
// State structure
{
  user: {
    profile: { name: "John", email: "john@example.com" },
    preferences: { theme: "dark" }
  },
  todos: {
    "1": { id: "1", text: "Buy milk", completed: false }
  }
}

// Storage keys created:
// namespace:state -> { entire state object }
```

**Example with zFactor: 1 (default):**

```typescript
// Storage keys created:
// namespace:user -> { "profile": {...}, "preferences": {...} }
// namespace:todos -> { "1": {...} }
```

**Example with zFactor: 2:**

```typescript
// Storage keys created:
// namespace:user:profile -> { "name": "John", "email": "john@example.com" }
// namespace:user:preferences -> { "theme": "dark" }
// namespace:todos:1 -> { "id": "1", "text": "Buy milk", "completed": false }
```

**Performance considerations:**

- **zFactor: 0**: Single key updates, best for atomic state changes
- **zFactor: 1**: Good balance between granularity and performance (default)
- **Higher zFactor (2+)**: More granular storage, better for collaborative editing of nested data

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

##### `generateTokenForStore(namespace: string, subscribedKeysAndPatterns: string[]): Promise<string>`

Generates a WebSocket token for a specific namespace.

```typescript
const tokenHelper = new TokenHelper(apiKey, baseUrl);
const token = await tokenHelper.generateTokenForStore('my-app', ['my-app:todos', 'my-app:*']);
```

**Parameters:**

- `namespace`: The store namespace
- `subscribedKeysAndPatterns`: Array of keys and patterns to subscribe to (supports wildcards with `*`)

##### `processTokenRequest(requestData: unknown): Promise<TokenResponse>`

Processes a token request and returns a structured response. Accepts both string and object formats.

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

## Error Types

### `MultiplayerError`

Base error class for multiplayer-related errors with enhanced categorization.

```typescript
class MultiplayerError extends Error {
  public readonly timestamp: number;
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;

  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly context?: ErrorContext,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    category: ErrorCategory = ErrorCategory.STATE_MANAGEMENT,
  )

  toSerializable(): Record<string, unknown>;
}
```

### Error Severity Levels

```typescript
enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}
```

### Error Categories

```typescript
enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  NETWORK = 'network',
  STORAGE = 'storage',
  HYDRATION = 'hydration',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  STATE_MANAGEMENT = 'state_management',
  CONFIGURATION = 'configuration',
  VALIDATION = 'validation',
}
```

### Specific Error Types

#### `AuthenticationError`

```typescript
class AuthenticationError extends MultiplayerError {
  constructor(message: string, context?: ErrorContext);
}
```

#### `ConfigurationError`

```typescript
class ConfigurationError extends MultiplayerError {
  constructor(message: string, context?: ErrorContext);
}
```

#### `HydrationError`

```typescript
class HydrationError extends MultiplayerError {
  constructor(message: string, context?: ErrorContext);
}
```

### Error Context

```typescript
interface ErrorContext {
  timestamp?: number;
  operation?: string;
  clientId?: string;
  namespace?: string;
  [key: string]: unknown;
}
```

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

## Logging

### LogLevel Enum

```typescript
enum LogLevel {
  DEBUG = 4,
  INFO = 3,
  WARN = 2,
  ERROR = 1,
  NONE = 0,
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

### Immer-Style Updates

Use arrow functions for Immer-style mutations:

```typescript
// ✅ Immer-style (arrow function)
set(state => {
  state.todos[id] = newTodo;
});

// ✅ Traditional functional update
set(state => ({
  todos: { ...state.todos, [id]: newTodo },
}));
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
3. **Implement authentication/authorization** for token endpoints
4. **Implement rate limiting** on token generation

## Migration Guide

### From v0.4.x to v0.5.x

#### Breaking Changes

1. **Enhanced Error Types**: New error hierarchy with categories and severity levels
2. **Improved State Manager**: Better conflict resolution and change detection
3. **TypeScript Updates**: Stricter typing for better development experience

#### Migration Steps

1. **Update Error Handling**:

   ```typescript
   // Before v0.5.0
   try {
     await multiplayer.hydrate();
   } catch (error) {
     console.error('Hydration failed:', error.message);
   }

   // v0.5.0+
   import { HydrationError, MultiplayerError } from '@hpkv/zustand-multiplayer';

   try {
     await multiplayer.hydrate();
   } catch (error) {
     if (error instanceof HydrationError) {
       console.error('Hydration failed:', error.toSerializable());
     } else if (error instanceof MultiplayerError) {
       console.error('Multiplayer error:', error.severity, error.category);
     }
   }
   ```

2. **Update TypeScript Types**:

   ```typescript
   // Ensure you're using WithMultiplayer wrapper
   const useStore = create<WithMultiplayer<MyState>>()(multiplayer(/* ... */));
   ```

3. **Configuration Updates**:
   ```typescript
   // New enhanced configuration options
   {
     // ... existing options
     logLevel: LogLevel.INFO, // Updated enum
     profiling: true, // Enhanced metrics
     onConflict: (conflicts) => {
       // Enhanced conflict info
       console.log('Conflicts:', conflicts.map(c => ({
         field: c.field,
         severity: c.severity, // New field
       })));
       return { strategy: 'keep-remote' };
     }
   }
   ```

### Converting Existing Zustand Stores

#### Step 1: Install Dependencies

```bash
npm install @hpkv/zustand-multiplayer
```

#### Step 2: Update Store Definition

```typescript
// Before: Regular Zustand store
import { create } from 'zustand';

interface TodoState {
  todos: Todo[];
  addTodo: (text: string) => void;
}

const useTodoStore = create<TodoState>(set => ({
  todos: [],
  addTodo: text =>
    set(state => ({
      todos: [...state.todos, { id: Date.now().toString(), text, completed: false }],
    })),
}));

// After: Multiplayer Zustand store
import { create } from 'zustand';
import { multiplayer, WithMultiplayer } from '@hpkv/zustand-multiplayer';

interface TodoState {
  todos: Record<string, Todo>; // Use Record for better conflict resolution
  addTodo: (text: string) => void;
}

const useTodoStore = create<WithMultiplayer<TodoState>>()(
  multiplayer(
    set => ({
      todos: {},
      addTodo: text =>
        set(state => {
          const id = Date.now().toString();
          state.todos[id] = { id, text, completed: false }; // Immer-style mutation
        }),
    }),
    {
      namespace: 'todos-v2',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
    },
  ),
);
```

#### Step 3: Update Component Usage

```typescript
// Component usage remains largely the same
function TodoList() {
  const { todos, addTodo, multiplayer } = useTodoStore();

  // Access multiplayer state and methods
  const isConnected = multiplayer.connectionState === ConnectionState.CONNECTED;

  return (
    <div>
      <div>Status: {isConnected ? '🟢' : '🔴'}</div>
      {Object.values(todos).map(todo => (
        <div key={todo.id}>{todo.text}</div>
      ))}
    </div>
  );
}
```

## Examples

### Real-World Use Cases

#### 1. Collaborative Document Editor

```typescript
interface DocumentState {
  title: string;
  content: string;
  cursors: Record<string, { position: number; user: string }>;
  comments: Record<string, Comment>;

  updateTitle: (title: string) => void;
  updateContent: (content: string) => void;
  setCursor: (userId: string, position: number) => void;
  addComment: (text: string, position: number) => void;
}

const useDocumentStore = create<WithMultiplayer<DocumentState>>()(
  multiplayer(
    set => ({
      title: '',
      content: '',
      cursors: {},
      comments: {},

      updateTitle: title =>
        set(state => {
          state.title = title;
        }),

      updateContent: content =>
        set(state => {
          state.content = content;
        }),

      setCursor: (userId, position) =>
        set(state => {
          state.cursors[userId] = { position, user: userId };
        }),

      addComment: (text, position) =>
        set(state => {
          const id = Date.now().toString();
          state.comments[id] = {
            id,
            text,
            position,
            author: 'current-user',
            timestamp: Date.now(),
          };
        }),
    }),
    {
      namespace: 'document-editor-v1',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
      zFactor: 2, // Granular storage for comments and cursors

      // Only sync collaborative data
      publishUpdatesFor: () => ['title', 'content', 'comments'],
      subscribeToUpdatesFor: () => ['title', 'content', 'comments', 'cursors'],

      onConflict: conflicts => {
        // Handle document conflicts intelligently
        const contentConflict = conflicts.find(c => c.field === 'content');
        if (contentConflict) {
          // Custom merge logic for document content
          return {
            strategy: 'merge',
            mergedValues: {
              content: mergeDocumentContent(
                contentConflict.localValue as string,
                contentConflict.remoteValue as string,
              ),
            },
          };
        }
        return { strategy: 'keep-remote' };
      },
    },
  ),
);

function mergeDocumentContent(local: string, remote: string): string {
  // Implement operational transformation or simple merge
  // This is a simplified example
  return `${remote}\n\n--- Local Changes ---\n${local}`;
}
```

#### 2. Live Gaming Leaderboard

```typescript
interface GameState {
  players: Record<string, Player>;
  gameStatus: 'waiting' | 'playing' | 'finished';
  currentRound: number;
  leaderboard: PlayerScore[];

  joinGame: (playerId: string, name: string) => void;
  updateScore: (playerId: string, score: number) => void;
  startRound: () => void;
  endGame: () => void;
}

const useGameStore = create<WithMultiplayer<GameState>>()(
  multiplayer(
    (set, get) => ({
      players: {},
      gameStatus: 'waiting',
      currentRound: 0,
      leaderboard: [],

      joinGame: (playerId, name) =>
        set(state => {
          state.players[playerId] = {
            id: playerId,
            name,
            score: 0,
            isActive: true,
            joinedAt: Date.now(),
          };
        }),

      updateScore: (playerId, score) =>
        set(state => {
          if (state.players[playerId]) {
            state.players[playerId].score += score;

            // Update leaderboard
            state.leaderboard = Object.values(state.players)
              .sort((a, b) => b.score - a.score)
              .map((player, index) => ({
                ...player,
                rank: index + 1,
              }));
          }
        }),

      startRound: () =>
        set(state => {
          state.currentRound += 1;
          state.gameStatus = 'playing';
        }),

      endGame: () =>
        set(state => {
          state.gameStatus = 'finished';
        }),
    }),
    {
      namespace: 'live-game-v1',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',
      zFactor: 1, // Each player as separate storage unit

      // Enhanced monitoring for games
      profiling: true,
      logLevel: LogLevel.INFO,

      onHydrate: state => {
        console.log(`Game hydrated: ${Object.keys(state.players).length} players`);
      },
    },
  ),
);
```

#### 3. Team Dashboard with Mixed Sync

```typescript
interface DashboardState {
  // Shared team data
  teamMetrics: Record<string, number>;
  sharedSettings: { theme: string; refreshRate: number };
  announcements: Record<string, Announcement>;

  // Local user data (not synced)
  userPreferences: { notifications: boolean; sidebarCollapsed: boolean };
  localDrafts: Record<string, string>;
  viewState: { selectedTab: string; filters: string[] };

  // Actions
  updateMetric: (key: string, value: number) => void;
  updateSharedSettings: (settings: Partial<DashboardState['sharedSettings']>) => void;
  addAnnouncement: (text: string) => void;
  setUserPreference: (key: string, value: any) => void;
}

const useDashboardStore = create<WithMultiplayer<DashboardState>>()(
  multiplayer(
    set => ({
      // Shared data
      teamMetrics: {},
      sharedSettings: { theme: 'light', refreshRate: 30 },
      announcements: {},

      // Local data
      userPreferences: { notifications: true, sidebarCollapsed: false },
      localDrafts: {},
      viewState: { selectedTab: 'overview', filters: [] },

      updateMetric: (key, value) =>
        set(state => {
          state.teamMetrics[key] = value;
        }),

      updateSharedSettings: settings =>
        set(state => {
          Object.assign(state.sharedSettings, settings);
        }),

      addAnnouncement: text =>
        set(state => {
          const id = Date.now().toString();
          state.announcements[id] = {
            id,
            text,
            author: 'current-user',
            timestamp: Date.now(),
          };
        }),

      setUserPreference: (key, value) =>
        set(state => {
          state.userPreferences[key] = value;
        }),
    }),
    {
      namespace: 'team-dashboard-v1',
      apiBaseUrl: process.env.NEXT_PUBLIC_HPKV_API_BASE_URL!,
      tokenGenerationUrl: '/api/generate-token',

      // Selective sync: only shared data
      publishUpdatesFor: () => ['teamMetrics', 'sharedSettings', 'announcements'],
      subscribeToUpdatesFor: () => ['teamMetrics', 'sharedSettings', 'announcements'],

      // Custom retry config for dashboard reliability
      retryConfig: {
        maxRetries: 10,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffFactor: 1.5,
      },
    },
  ),
);
```

### Testing Examples

#### Unit Testing

```typescript
import { renderHook, act } from '@testing-library/react';
import { useTodoStore } from './store';

describe('Todo Store', () => {
  beforeEach(() => {
    // Reset store state
    useTodoStore.getState().multiplayer.clearStorage();
  });

  it('should add todos correctly', () => {
    const { result } = renderHook(() => useTodoStore());

    act(() => {
      result.current.addTodo('Test todo');
    });

    const todos = Object.values(result.current.todos);
    expect(todos).toHaveLength(1);
    expect(todos[0].text).toBe('Test todo');
  });

  it('should handle connection states', async () => {
    const { result } = renderHook(() => useTodoStore());

    // Test connection methods
    await act(async () => {
      await result.current.multiplayer.connect();
    });

    expect(result.current.multiplayer.connectionState).toBe('CONNECTED');
  });
});
```

#### Integration Testing

```typescript
import { createStore } from 'zustand/vanilla';
import { multiplayer } from '@hpkv/zustand-multiplayer';

describe('Multiplayer Integration', () => {
  it('should sync between multiple store instances', async () => {
    const createTestStore = () =>
      createStore(
        multiplayer(
          set => ({
            counter: 0,
            increment: () =>
              set(state => {
                state.counter += 1;
              }),
          }),
          {
            namespace: 'test-sync',
            apiBaseUrl: process.env.TEST_HPKV_API_BASE_URL!,
            apiKey: process.env.TEST_HPKV_API_KEY!,
          },
        ),
      );

    const store1 = createTestStore();
    const store2 = createTestStore();

    // Wait for both stores to connect and hydrate
    await Promise.all([
      store1.getState().multiplayer.connect(),
      store2.getState().multiplayer.connect(),
    ]);

    // Update store1
    store1.getState().increment();

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check that store2 received the update
    expect(store2.getState().counter).toBe(1);
  });
});
```
