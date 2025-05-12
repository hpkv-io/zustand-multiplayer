## Table of Contents

- [Types](#types)
  - [Signature](#signature)
  - [Mutator](#mutator)
  - [Multiplayer Types](#multiplayer-types)
- [Reference](#reference)
  - [`multiplayer(initializer, options)`](#multiplayerinitializer-options)
  - [`multiplayer` API Reference](#multiplayer-api-reference)

## Types

### Signature

```typescript
multiplayer<T, U>(stateCreatorFn: StateCreator<T, [], []>, multiplayerOptions?: MultiplayerOptions<T>): StateCreator<T, [['zustand/multiplayer', U]], []>
```

### Mutator

```typescript
['zustand/multiplayer', U];
```

### Multiplayer Types

Here are the core types used by the `multiplayer` middleware:

```typescript
import type { ConnectionConfig, ConnectionStats } from '@hpkv/websocket-client';

// Configuration options for the multiplayer middleware
export type MultiplayerOptions<S> = {
  // A unique identifier for this store's data in HPKV.
  // All keys will be prefixed with this namespace.
  namespace: string;
  // Your HPKV API base URL (from the HPKV Dashboard).
  apiBaseUrl: string;
  // Your HPKV API Key (required for server-side stores, keep secret).
  apiKey?: string;
  // The URL of your backend endpoint for generating client-side tokens
  // (required for client-side stores).
  tokenGenerationUrl?: string;
  // Optional configuration for the underlying @hpkv/websocket-client.
  clientConfiguration?: ConnectionConfig;
  // Optional function returning an array of state keys.
  // Only changes to these keys will be published to other clients.
  // Defaults to all top-level non-function keys.
  publishUpdatesFor?: () => Array<keyof S>;
  // Optional function returning an array of state keys.
  // This client will only subscribe to updates for these keys.
  // Defaults to all top-level non-function keys.
  subscribeToUpdatesFor?: () => Array<keyof S>;
  // Optional callback executed after the initial state hydration from HPKV.
  onHydrate?: (state: S) => void;
};

// Type utility to augment the Zustand store type with the multiplayer API
export type WithMultiplayer<S, A> = S extends { getState: () => infer T }
  ? Write<S, MultiplayerStore<T, A>>
  : never;

// The structure added to your store instance by the middleware
export type MultiplayerStore<T, P = T> = {
  multiplayer: {
    // Fetches the current state of subscribed keys directly from HPKV.
    getSubscribedState: () => Promise<P>;
    // Manually triggers a full re-fetch and application of subscribed state from HPKV.
    hydrate: () => Promise<void>;
    // Removes all items associated with the store's namespace from HPKV.
    clearStorage: () => Promise<void>;
    // Closes the WebSocket connection.
    disconnect: () => Promise<void>;
    // Returns the current connection status object or null.
    getConnectionStatus: () => ConnectionStats | null;
  };
};

// -- Relevant types from @hpkv/websocket-client --

// Describes the connection status (imported from @hpkv/websocket-client)

Interface representing connection statistics.

| Property | Type | Description |
| -------- | ---- | ----------- |
| `isConnected` | `boolean` | Whether the client is currently connected |
| `reconnectAttempts` | `number` | Number of reconnect attempts since the last successful connection |
| `messagesPending` | `number` | Number of messages awaiting a response |
| `connectionState` | `string` (`ConnectionState` enum) | Current state of the connection |
| `throttling` | `object \| null` | Throttling metrics if enabled (contains `currentRate`, `queueLength`) |

Enum representing the connection state.

| Value | Description |
| ----- | ----------- |
| `DISCONNECTED` | Not connected |
| `CONNECTING` | Connection in progress |
| `CONNECTED` | Successfully connected |
| `DISCONNECTING` | Disconnection in progress |

// -- Types for Token Generation (relevant for backend setup) --

// Request format expected by the token generation endpoint
export interface TokenRequest {
  namespace: string;
  subscribedKeys: string[]; // Fully qualified keys (namespace:key)
}

// Response format from the token generation endpoint
export interface TokenResponse {
  namespace: string;
  token: string;
}

// Utility type used internally
type Write<T, U> = Omit<T, keyof U> & U;
```

## Reference

### `multiplayer(initializer, options)`

This is the middleware function you wrap your Zustand store's initializer with.

- **`initializer`**: `(set, get, api) => State`
  - Your standard Zustand state creator function.
- **`options`**: `MultiplayerOptions<State>`
  - The configuration object for the middleware (see [Multiplayer Types](#multiplayer-types) section above).
  - Requires `namespace` and `apiBaseUrl`.
  - Requires either `apiKey` (for server-side) or `tokenGenerationUrl` (for client-side).

**Returns:** A Zustand `StateCreator` compatible with other middlewares.

### `multiplayer` API Reference

Once your store is created with the middleware, it gains a `multiplayer` property containing the following methods:

- **`getSubscribedState(): Promise<PartialState>`**

  - Fetches the latest values for all keys the current client is subscribed to directly from the HPKV server.
  - Returns a promise resolving to an object containing the key-value pairs. The type `PartialState` reflects that it might only be a subset of the full store state if `subscribeToUpdatesFor` is used.

- **`hydrate(): Promise<void>`**

  - Manually triggers a synchronization process.
  - Fetches the latest state for subscribed keys from HPKV and updates the local Zustand store accordingly.
  - Called automatically on initialization, but can be called manually if needed (e.g., after a manual reconnect or suspected desync).

- **`clearStorage(): Promise<void>`**

  - Deletes _all_ key-value pairs associated with the store's `namespace` from the HPKV server.
  - **Use with caution**, as this affects all clients connected to the same namespace.
  - Returns a promise that resolves when the operation is complete.

- **`disconnect(): Promise<void>`**

  - Closes the WebSocket connection to the HPKV server.
  - The underlying client might attempt automatic reconnection depending on its configuration.
  - Returns a promise that resolves when the disconnection attempt is initiated.

- **`getConnectionStatus(): ConnectionStats | null`**
  - Returns an object containing details about the current WebSocket connection status (see `ConnectionStats` in [Types](#types)).
  - Provides information like `isConnected`, `isConnecting`, `latency`, etc.
  - Returns `null` if the client hasn't been initialized yet.
