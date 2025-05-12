# Zustand Multiplayer Middleware

[![npm version](https://img.shields.io/npm/v/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)
[![npm downloads](https://img.shields.io/npm/dm/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)


![HPKV logo](assets/images/logo.png)

A real-time synchronization middleware for [Zustand](https://github.com/pmndrs/zustand) that uses [HPKV](https://hpkv.io)'s [WebSocket API](https://hpkv.io/docs/websocket-api) for storage and real-time updates across clients.

- **Examples:** For examples of creating collaborative apps using multiplayer middleware, see [Examples Directory](./examples/)

## Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Usage](#usage)
  - [Install](#install)
  - [1. Basic Usage](#1-basic-usage)
    - [React Usage Example](#react-usage-example)
    - [Usage Without React Example](#usage-without-react-example)
    - [Server-Side Store Example](#server-side-store-example)
  - [2. Setting up the Token Generation Endpoint (for Client-Side Stores)](#2-setting-up-the-token-generation-endpoint-for-client-side-stores)
  - [3. Fine-Grained State Synchronization](#3-fine-grained-state-synchronization)
    - [Selecting Changes to Publish (`publishUpdatesFor`)](#selecting-changes-to-publish-publishupdatesfor)
    - [Selecting Changes to Subscribe (`subscribeToUpdatesFor`)](#selecting-changes-to-subscribe-subscribeupdatesfor)
  - [4. Managing Connection Status](#4-managing-connection-status)
  - [5. Client Configuration](#5-client-configuration)
- [How It Works](./docs/How_It_Works.md)
- [Types and API Reference](./docs/API_REFERENCE.md)
- [Related Documentation](#related-documentation)
- [License](#license)

## Introduction

The `multiplayer` middleware extends [Zustand](https://github.com/pmndrs/zustand) with powerful state persistence and real-time synchronization capabilities, enabling seamless state sharing across multiple clients. While Zustand excels at managing local state, this middleware bridges the gap to distributed state management by leveraging [HPKV](https://hpkv.io)'s [WebSocket API](https://hpkv.io/docs/websocket-api).

At the core of the synchronization is the concept of a `namespace`. Each multiplayer store is configured with a unique namespace string. This namespace serves two primary purposes:

1.  **Unique Identification & Persistence**: The namespace uniquely identifies your shared state within HPKV. All state properties managed by the middleware are stored under keys prefixed with this namespace. For example, if your namespace is `my-app-space` and your state has a `count` property, it will be stored in HPKV under the key `my-app-space:count`. This ensures that data from different applications or different instances of the same application remain separate unless intentionally shared.
2.  **Collaboration Scope**: Any Zustand store instances initialized with the *same* namespace will automatically share the same underlying data in HPKV. Changes published by one store instance (e.g., updating `count`) will be received in real-time by all other store instances connected to the same namespace (provided they are subscribed to that specific state key). This allows for effortless collaboration and state synchronization across different clients or server instances.

It's important to note that while multiple store instances can connect to the same namespace, they don't necessarily need to have identical state structures defined in their `create` function. A client might only subscribe to a subset of the keys available in the shared namespace, or might have local-only state properties alongside the shared ones. However, careful consideration should be given to how different state structures interact within the same namespace to avoid unexpected behavior.

The middleware is designed to be flexible, allowing developers to control exactly what state is shared (published) and received (subscribed) within a given namespace using the `publishUpdatesFor` and `subscribeToUpdatesFor` options.

## Features

- **Real-time state synchronization** between multiple clients.
- **Persistent state storage** using HPKV WebSocket API.
- **Selective state synchronization**: Control which parts of the state are published and subscribed to.
- **Server-side and Client-side stores support**:
    - Use `apiKey` for server-side instances.
    - Use `tokenGenerationUrl` for client-side instances to securely fetch tokens.
- **Automatic reconnection** and connection status management (provided by underlying `@hpkv/websocket-client`).
- **TypeScript support** with full type definitions.

## Prerequisites

1. **HPKV Account**: Sign up for a free HPKV account at [https://hpkv.io/signup](https://hpkv.io/signup)
2. **API Key**: Create an API key in the [HPKV Dashboard](https://hpkv.io/dashboard/api-keys)
3. **API Base URL**: Note your API Base URL from the dashboard API keys section

You can find both your API key and base URL in the [HPKV Dashboard API Keys section](https://hpkv.io/dashboard/api-keys).

## Usage

Here's how to integrate and use the `zustand-multiplayer` middleware.

### Install

First, install the middleware:
```bash
npm install @hpkv/zustand-multiplayer zustand
# or
yarn add @hpkv/zustand-multiplayer zustand
```

### 1. Basic Usage

#### React Usage Example

This example demonstrates creating and using the store in React

##### Step 1:  First create a store

```typescript
// src/store.ts
import { create } from 'zustand';
import { multiplayer } from '@hpkv/zustand-multiplayer';

interface GlobalCounterState {
  count: number;
  increment: () => void;
}

export const useGlobalCounterStore = create<MyState>()(
  multiplayer(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    {
      namespace: 'global-counter-app', // Unique namespace for this store's data in HPKV
      apiBaseUrl:'YOUR_HPKV_BASE_URL', // From HPKV Dashboard
      tokenGenerationUrl: 'YOUR_TOKEN_GENERATION_ENDPOINT', // Your backend endpoint to generate tokens (See step 2)
    }
  )
);
```
##### Step 2: Then setup the token generation endpoint

You'll need to set up an API endpoint for token generation. See [Token generation section](#2-setting-up-the-token-generation-endpoint-for-client-side-stores).  Pass this endpoint url to the `tokenGenerationUrl` option in the `create` method when creating the store.


##### Step 3: And use the store in your react components
Once the counter value increased by one client, all other clients will be updated with the latest value.

```typescript
import { useGlobalCounterStore } from './store';

function GlobalCounter(){
  const count = useGlobalCounterStore((state) => state.count);
  return <h1>Global Counter Value: {count}</h1>
}

function Controls(){
  const increment = useStore((state) => state.increment)
  return <button onClick={increment}>one up</button>
}
```

#### Usage without React Example

```typescript
import { createStore } from 'zustand/vanilla';
import { multiplayer } from './multiplayer';

const store = createStore(
  multiplayer(
    set => ({
      count: 0,
      increment: () => set(state => ({ count: state.count + 1 })),
    }),
    {
      namespace: 'global-counter-app',
      apiBaseUrl:'YOUR_HPKV_BASE_URL',
      tokenGenerationUrl: 'YOUR_TOKEN_GENERATION_ENDPOINT',
    },
  ),
);

const { getState, setState, subscribe,
  multiplayer: { disconnect, getConnectionStatus, clearStorage, getSubscribedState, hydrate },
} = store;

export default store;
```

#### Server-Side Store Example

This can be useful for Node.js backends or scripts that need to share state with other client-side or server-side store clients. Please note that, instead of `tokenGenerationUrl`, you'll need to set `apiKey` option for creating server-side stores.

Below example shows a server process running jobs and updating progress in the server store. At the client side, you can create stores with the same namespace to receive live progress updates about running jobs. For examples on building client-side stores, see the previous sections,

##### Creating Server Store

```typescript
// server/store.ts
import { createStore } from 'zustand/vanilla';
import { multiplayer } from './multiplayer';

interface Job {
  id: string;
  progress: number;
  completed: boolean;
}
interface JobsState {
  jobs: Job[];
  addJob: (job: Job) => void;
  updateJobProgress: (id: string, job: Job) => void;
}

const store = createStore<JobsState>()(
  multiplayer(
    set => ({
      jobs: [],
      addJob: (job: Job) => set(state => ({ jobs: [...state.jobs, job] })),
      updateJobProgress: (id: string, job: Partial<Job>) =>
        set(state => ({ jobs: state.jobs.map(j => (j.id === id ? { ...j, ...job } : j)) })),
    }),
    {
      namespace: 'jobs-store',
      apiBaseUrl:'YOUR_HPKV_BASE_URL',
      apiKey: 'YOUR_API_KEY',
    },
  ),
);

export default store;

// ....
// A function simulating the backgroung job running
async function startBackgroundJob() {
  const jobId = Math.random().toString(36).substring(2, 15);
  store.getState().addJob({ id: jobId, progress: 0, completed: false });
  // Simulate work
  for (let i = 0; i < 10; i++) {
    store.getState().updateJobProgress(jobId, { progress: i, completed: false });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  // Update job as completed
  store.getState().updateJobProgress(jobId, { progress: 100, completed: true });
}
```
**Important**: Never expose your `apiKey` in client-side code.

### 2. Setting up the Token Generation Endpoint (for Client-Side Stores)

For client-side stores, you must provide a `tokenGenerationUrl`. This is an endpoint on your backend that securely generates an HPKV WebSocket token. The `TokenHelper` class assists with this. For more details see [Token API Documentation](./docs/TOKEN_API.md)

Here's an example using Next.js API routes:

```typescript
// pages/api/hpkv-token.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const HPKV_API_KEY = process.env.HPKV_API_KEY!;
const HPKV_API_BASE_URL = process.env.HPKV_API_BASE_URL!;

const tokenHelper = new TokenHelper(HPKV_API_KEY, HPKV_API_BASE_URL);

export default tokenHelper.createNextApiHandler();
```
The `TokenHelper` also provides `createExpressHandler()` and `createFastifyHandler()` for other Node.js frameworks. The client-side store will automatically call this endpoint, sending the `namespace` and the keys it intends to subscribe to (derived from `subscribeToUpdatesFor` or default behavior).

### 3. Fine-Grained State Synchronization

By default, the middleware syncs all top-level non-function properties of your state. You can customize this behavior using `publishUpdatesFor` and `subscribeToUpdatesFor` options.

#### Selecting Changes to Publish (`publishUpdatesFor`)

Use `publishUpdatesFor` to specify which parts of the state should be sent to other clients when they change locally. 
The changes made to the other keys will remain local and won't propagate to other clients or persisted on the database.

```typescript
interface UserProfile {
  id: string;
  username: string;
  email?: string;
  lastActive: number;
  theme: 'dark' | 'light' | null;
  // ... other actions
}

export const useUserStore = create<UserProfile>()(
  multiplayer(
    (set) => ({
      id: '',
      username: '',
      email: '';
      lastActive: Date.now(),
      theme: null,
      // ... actions to update state
    }),
    {
      namespace: 'users:user-123',
      apiBaseUrl: /* ... */,
      tokenGenerationUrl: /* ... */,
      publishUpdatesFor: () => ['theme'], // Only changes to theme key are published
    }
  )
);
```
If `publishUpdatesFor` is not provided, all non-function keys from the initial state are persisted and published.

#### Selecting Changes to Subscribe (`subscribeToUpdatesFor`)

Use `subscribeToUpdatesFor` to specify which parts of the state this client should listen for updates from other clients.

```typescript
interface GameState {
  palyer1Score: number;
  player2Score: number;
  player1Name: string;
  player2Name: string;
  // ... other actions
}

// This client is only interested in getting score updates
export const useGameStore = create<GameState>()(
  multiplayer(
    (set) => ({
      palyer1Score: 0,
      player2Score: 0,
      player1Name: 'Player1',
      player2Name: 'Player2'
      // ... actions
    }),
    {
      namespace: 'game-room-1',
      apiBaseUrl: /* ... */,
      tokenGenerationUrl: /* ... */,
      subscribeToUpdatesFor: () => ['palyer1Score', 'player2Score'], // Only listen for changes to scores
    }
  )
);
```
If `subscribeToUpdatesFor` is not provided, the client subscribes to updates for all non-function keys from the initial state. The keys provided to `subscribeToUpdatesFor` are used by middleware to request specific subscribed keys, from the HPKV server during token generation and subscription.

### 4. Managing Connection Status

The underlying `@hpkv/websocket-client` automatically handles reconnections. You can monitor the detailed connection status using `store.multiplayer.getConnectionStatus()`, which returns a `ConnectionStats` object or `null` if the client isn't initialized yet.

```typescript
import { useEffect, useState } from 'react';
import { useMyStore } from './store'; // Your multiplayer store
import { ConnectionStats, ConnectionState } from '@hpkv/websocket-client';

function ConnectionStatusIndicator() {
  const { getConnectionStatus } = useMyStore().multiplayer;
  const [status, setStatus] = useState<ConnectionStats | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(getConnectionStatus());
    }, 1000); // Check status periodically
    return () => clearInterval(interval);
  }, [getConnectionStatus]);

  if (!status) return <p>Status: Initializing...</p>;

  switch (status.connectionState) {
    case ConnectionState.CONNECTED:
      return <p>Status: Connected (Pending: {status.messagesPending})</p>;
    case ConnectionState.CONNECTING:
      return <p>Status: Connecting... (Attempts: {status.reconnectAttempts})</p>;
    case ConnectionState.DISCONNECTING:
      return <p>Status: Disconnecting...</p>;
    case ConnectionState.DISCONNECTED:
      return <p>Status: Disconnected (Attempts: {status.reconnectAttempts})</p>;
    default:
      return <p>Status: Unknown</p>;
  }
}
```

The `ConnectionStats` object provides detailed insights:

*   `isConnected` (boolean): True if the WebSocket is actively connected.
*   `connectionState` (enum: `CONNECTED`, `CONNECTING`, `DISCONNECTED`, `DISCONNECTING`): The current phase of the connection.
*   `reconnectAttempts` (number): How many times the client tried to reconnect since the last successful connection.
*   `messagesPending` (number): Number of outgoing messages waiting for a server response.
*   `throttling` (object | null): If throttling is enabled, provides `currentRate` and `queueLength`.

Refer to the `ConnectionStats` type definition in the [Types section](#types) for the full structure.

### 5. Client Configuration

You can customize the behavior of the underlying `@hpkv/websocket-client` by passing a `clientConfiguration` object within the `MultiplayerOptions`. This allows fine-tuning aspects like connection timeouts, reconnection strategies, and throttling.

```typescript
import { create } from 'zustand';
import { multiplayer } from '@hpkv/zustand-multiplayer';
import type { ConnectionConfig } from '@hpkv/websocket-client';

// ... (interface definition)

// Example configuration based on @hpkv/websocket-client options
const clientConfig: ConnectionConfig = {
  // Connection retry settings
  maxReconnectAttempts: 10,                 // Stop after 10 failed attempts
  initialDelayBetweenReconnects: 1000,      // Start with 1s delay
  maxDelayBetweenReconnects: 30000,         // Cap delay at 30s
  // Throttling settings
  throttling: {
    enabled: true,                        // Enable client-side throttling
    rateLimit: 100,                       // Target max 100 messages/sec
  }
  // Refer to @hpkv/websocket-client documentation for all available options.
};

export const useConfiguredStore = create<MyState>()(
  multiplayer(
    (set) => ({ /* ... state ... */ }),
    {
      namespace: 'configured-store',
      apiBaseUrl:'YOUR_HPKV_BASE_URL',
      tokenGenerationUrl: 'YOUR_TOKEN_GENERATION_ENDPOINT',
      clientConfiguration: clientConfig, // Pass the configuration here
    }
  )
);
```

Key configuration areas within `clientConfiguration` include:

*   **Connection Retries**:
    *   `maxReconnectAttempts`: Maximum number of times to try reconnecting.
    *   `initialDelayBetweenReconnects`: Time (ms) before the first reconnection attempt.
    *   `maxDelayBetweenReconnects`: Maximum time (ms) to wait between attempts (uses exponential backoff).
*   **Throttling** (nested under `throttling` property):
    *   `enabled`: Whether to enable client-side message throttling.
    *   `rateLimit`: Target maximum messages to send per second.

Refer to the [`@hpkv/websocket-client`](https://github.com/hpkv-io/websocket-client/blob/develop/sdk/node/README.md) documentation for a complete list and structure of available configuration options.

## Related Documentation
- [Types & API Reference](./docs/API_REFERENCE.md)
- [Token Generation Guide](./docs/TOKEN_API.md)
- [How It Works](./docs//How_It_Works.md)
- [HPKV Pub/Sub Feature](https://hpkv.io/blog/2025/03/real-time-pub-sub)
- [HPKV Websocket Client Documentation](https://github.com/hpkv-io/websocket-client/blob/develop/sdk/node/README.md)
- [HPKV Documentation](https://hpkv.io/docs)


## License
  MIT