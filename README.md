# Zustand Multiplayer Middleware

[![npm version](https://img.shields.io/npm/v/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)
[![npm downloads](https://img.shields.io/npm/dm/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)

A real-time synchronization middleware for [Zustand](https://github.com/pmndrs/zustand) that uses [HPKV](https://hpkv.io)'s [WebSocket API](https://hpkv.io/docs/websocket-api) for storage and real-time updates across clients.

## Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
  - [1. Basic Setup](#1-basic-setup)
    - [Client-Side Store Example](#client-side-store-example)
    - [Server-Side Store Example](#server-side-store-example)
  - [2. Setting up the Token Generation Endpoint (for Client-Side Stores)](#2-setting-up-the-token-generation-endpoint-for-client-side-stores)
  - [3. Fine-Grained State Synchronization](#3-fine-grained-state-synchronization)
    - [Selecting Changes to Publish (`publishUpdatesFor`)](#selecting-changes-to-publish-publishupdatesfor)
    - [Selecting Changes to Subscribe (`subscribeToUpdatesFor`)](#selecting-changes-to-subscribe-subscribeupdatesfor)
  - [4. API Reference](#4-api-reference)
    - [Zustand API](#zustand-api)
    - [Multiplayer API](#multiplayer-api)
- [Managing Connection Status](#managing-connection-status)
- [How It Works](#how-it-works)
- [License](#license)

## Introduction

The `multiplayer` middleware extends [Zustand](https://github.com/pmndrs/zustand) with powerful real-time synchronization capabilities, enabling seamless state sharing across multiple clients. While Zustand excels at managing local state, this middleware bridges the gap to distributed state management by leveraging [HPKV](https://hpkv.io)'s [WebSocket API](https://hpkv.io/docs/websocket-api). It's designed to be flexible, allowing developers to control exactly what state is shared and how.

## Features

- **Real-time state synchronization** between multiple clients.
- **Persistent state storage** using HPKV WebSocket API.
- **Selective state synchronization**: Control which parts of the state are published and subscribed to.
- **Server-side and Client-side support**:
    - Use `apiKey` for server-side instances.
    - Use `tokenGenerationUrl` for client-side instances to securely fetch tokens.
- **Automatic reconnection** and connection status management (provided by underlying `@hpkv/websocket-client`).
- **TypeScript support** with full type definitions.

## Prerequisites

1. **HPKV Account**: Sign up for a free HPKV account at [https://hpkv.io/signup](https://hpkv.io/signup)
2. **API Key**: Create an API key in the [HPKV Dashboard](https://hpkv.io/dashboard/api-keys)
3. **API Base URL**: Note your API Base URL from the dashboard API keys section

You can find both your API key and base URL in the [HPKV Dashboard API Keys section](https://hpkv.io/dashboard/api-keys).

## Installation

```bash
npm install @hpkv/zustand-multiplayer
```

## Usage

Here's how to integrate and use the `zustand-multiplayer` middleware.

### 1. Basic Setup

First, install the middleware:
```bash
npm install @hpkv/zustand-multiplayer zustand
# or
yarn add @hpkv/zustand-multiplayer zustand
```

#### Client-Side Store Example

This is the most common scenario for UIs (e.g., React, Vue, Svelte applications).

```typescript
// src/store.ts
import { create } from 'zustand';
import { multiplayer } from '@hpkv/zustand-multiplayer';

interface MyState {
  count: number;
  message: string;
  increment: () => void;
  setMessage: (msg: string) => void;
}

export const useMyStore = create<MyState>()(
  multiplayer(
    (set) => ({
      count: 0,
      message: '',
      increment: () => set((state) => ({ count: state.count + 1 })),
      setMessage: (msg: string) => set({ message: msg }),
    }),
    {
      namespace: 'my-app-space', // Unique namespace for this store's data in HPKV
      apiBaseUrl:'YOUR_HPKV_BASE_URL', // From HPKV Dashboard
      tokenGenerationUrl: 'YOUR_TOKEN_GENERATION_ENDPOINT', // Your backend endpoint to generate tokens
    }
  )
);

// To use in a React component:
// import { useMyStore } from './store';
// const { count, increment, multiplayer } = useMyStore();
```

You'll need to set up an API endpoint at `/api/hpkv-token` (see section 2).

#### Server-Side Store Example

This can be useful for Node.js backends or scripts that need to share state.

```typescript
// server/store.ts
import { create } from 'zustand';
import { multiplayer } from '@hpkv/zustand-multiplayer';

interface ServerMetrics {
  activeConnections: number;
  requestsPerSecond: number;
  updateMetrics: (connections: number, rps: number) => void;
}

// Ensure environment variables are loaded (e.g., using dotenv)
// process.env.HPKV_API_KEY
// process.env.HPKV_API_BASE_URL

export const serverMetricsStore = create<ServerMetrics>()(
  multiplayer(
    (set) => ({
      activeConnections: 0,
      requestsPerSecond: 0,
      updateMetrics: (connections, rps) => set({ activeConnections: connections, requestsPerSecond: rps }),
    }),
    {
      namespace: 'server-metrics-space',
      apiBaseUrl: process.env.HPKV_API_BASE_URL!, // From HPKV Dashboard
      apiKey: process.env.HPKV_API_KEY!, // Your HPKV API Key (keep this secret)
    }
  )
);

// Usage:
// serverMetricsStore.getState().updateMetrics(100, 50);
// const metrics = serverMetricsStore.getState();
// console.log(metrics.activeConnections);
```
**Important**: Never expose your `apiKey` in client-side code.

### 2. Setting up the Token Generation Endpoint (for Client-Side Stores)

For client-side stores, you must provide a `tokenGenerationUrl`. This is an endpoint on your backend that securely generates an HPKV WebSocket token. The `TokenHelper` class assists with this. For more details see [Token API Documentation](./docs/TOKEN_API.md)

Here's an example using Next.js API routes:

```typescript
// pages/api/hpkv-token.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { TokenHelper, TokenRequest, TokenResponse } from '@hpkv/zustand-multiplayer/token-helper'; // Adjust path if necessary

// Ensure these are set in your environment variables
const HPKV_API_KEY = process.env.HPKV_API_KEY!;
const HPKV_API_BASE_URL = process.env.HPKV_API_BASE_URL!;

const tokenHelper = new TokenHelper(HPKV_API_KEY, HPKV_API_BASE_URL);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TokenResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // The client will send { namespace: string, subscribedKeys: string[] }
    // subscribedKeys are the fully-qualified keys (e.g., namespace:key)
    const tokenRequest = req.body as TokenRequest;
    const response = await tokenHelper.processTokenRequest(tokenRequest);
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during token generation';
    console.error('Token generation error:', message);
    res.status(400).json({ error: message });
  }
}
```
The `token-helper.ts` also provides `createExpressHandler()` and `createFastifyHandler()` for other Node.js frameworks. The client-side `HPKVStorage` will automatically call this endpoint, sending the `namespace` and the keys it intends to subscribe to (derived from `subscribeToUpdatesFor` or default behavior).

### 3. Fine-Grained State Synchronization

By default, the middleware syncs all top-level non-function properties of your state. You can customize this behavior using `publishUpdatesFor` and `subscribeToUpdatesFor` options.

#### Selecting Changes to Publish (`publishUpdatesFor`)

Use `publishUpdatesFor` to specify which parts of the state should be sent to other clients when they change locally.

```typescript
interface UserProfile {
  id: string;
  username: string;
  email?: string; // Only publish username, not email
  lastActive: number;
  theme: 'dark' | 'light';
  // ... other actions
}

export const useUserStore = create<UserProfile>()(
  multiplayer(
    (set) => ({
      id: '123',
      username: 'guest',
      lastActive: Date.now(),
      theme: 'light',
      // ... actions to update state
    }),
    {
      namespace: 'user-profiles',
      apiBaseUrl: /* ... */,
      tokenGenerationUrl: /* ... */,
      publishUpdatesFor: () => ['username', 'lastActive', 'theme'], // Only these keys are published
    }
  )
);
```
If `publishUpdatesFor` is not provided, all non-function keys from the initial state are published.

#### Selecting Changes to Subscribe (`subscribeToUpdatesFor`)

Use `subscribeToUpdatesFor` to specify which parts of the state this client should listen for updates from other clients.

```typescript
interface GameState {
  score: number;
  level: number;
  playerName: string; // This client only cares about score and level updates
  opponentName?: string;
  // ... other actions
}

export const useGameStore = create<GameState>()(
  multiplayer(
    (set) => ({
      score: 0,
      level: 1,
      playerName: 'Player1',
      // ... actions
    }),
    {
      namespace: 'game-room-1',
      apiBaseUrl: /* ... */,
      tokenGenerationUrl: /* ... */,
      subscribeToUpdatesFor: () => ['score', 'level'], // Only listen for changes to score and level
    }
  )
);
```
If `subscribeToUpdatesFor` is not provided, the client subscribes to updates for all non-function keys from the initial state. The keys provided to `subscribeToUpdatesFor` are used by `HPKVStorage` to request specific keys from the HPKV server during token generation and subscription.

### 4. API Reference

#### Zustand API

All standard Zustand APIs remain available and function as expected for state management:

*   `getState(): TState`: Returns the current state.
*   `setState(partial, replace?)`: Updates the state. Changes made via `setState` will be broadcast to other clients if the affected keys are published.
*   `subscribe(listener, selector?, equalityFn?)`: Subscribes to local state changes.

Refer to the [official Zustand documentation](https://github.com/pmndrs/zustand) for more details.

#### Multiplayer API

The middleware adds a `multiplayer` object to your store instance, providing control over the synchronization behavior:

```typescript
const myStore = useMyStore(); // Assuming useMyStore is your multiplayer-enabled store

// Access the multiplayer API via:
// myStore.multiplayer.someFunction()
```

Available methods:

*   **`getSubscribedState(): Promise<P>`**
    *   Fetches the current state of all keys this client is subscribed to directly from the HPKV server. `P` is the type of the (potentially partial) state.
    *   Useful for getting the latest server truth for the subscribed parts of the state.

*   **`hydrate(): Promise<void>`**
    *   Manually triggers a full re-fetch and application of the shared state from HPKV for all keys this client is subscribed to. This is called automatically on initialization.
    *   You might call this if you suspect the local state is out of sync or after re-establishing a connection manually.

*   **`clearStorage(): Promise<void>`**
    *   Removes all items associated with the store's `namespace` from the HPKV server.
    *   Use with caution, as this affects all clients using the same namespace.

*   **`disconnect(): Promise<void>`**
    *   Closes the WebSocket connection to HPKV. The underlying client might attempt to reconnect based on its configuration.

*   **`getConnectionStatus(): ConnectionStats | null`**
    *   Returns an object with details about the current WebSocket connection status (e.g., `isConnected`, `isConnecting`, `serverUri`, `connectionId`, `latency`).
    *   `ConnectionStats` is imported from `@hpkv/websocket-client`. Returns `null` if the client is not yet initialized.

## Managing Connection Status

The underlying `@hpkv/websocket-client` automatically handles reconnections. You can monitor the connection status using `store.multiplayer.getConnectionStatus()`.

```typescript
import { useEffect, useState } from 'react';
import { useMyStore } from './store'; // Your multiplayer store
import { ConnectionStats } from '@hpkv/websocket-client';

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
  if (status.isConnected) return <p>Status: Connected (Latency: {status.latency}ms)</p>;
  if (status.isConnecting) return <p>Status: Connecting...</p>;
  return <p>Status: Disconnected</p>;
}
```

This provides a basic way to display connection info. For more advanced scenarios, you might need to delve into the `@hpkv/websocket-client`'s event system if exposed or needed. The current middleware abstracts most of this.

### How It Works

The middleware operates by integrating directly with Zustand's state management and HPKV's real-time messaging and persistence capabilities:

1.  **Initialization**:
    *   When you create a store with the `multiplayer` middleware, it initializes `HPKVStorage` (`src/hpkvStorage.ts`).
    *   `HPKVStorage` is responsible for all communication with the HPKV backend.
    *   For client-side stores, it fetches a secure WebSocket token from your `tokenGenerationUrl`. For server-side stores, it uses the provided `apiKey` to generate a token via `TokenHelper` (`src/token-helper.ts`).
    *   It then establishes a WebSocket connection to HPKV using the `@hpkv/websocket-client` library.

2.  **State Hydration**:
    *   Upon connection (or reconnection), the middleware can hydrate the store's state by fetching all relevant data for the configured `namespace` from HPKV.

3.  **Local State Changes**:
    *   When you update your Zustand store (e.g., using `set` or action calls), the `multiplayer` middleware intercepts these changes.
    *   If the changed keys are configured to be published (via `publishUpdatesFor`, or by default all non-function keys), the middleware instructs `HPKVStorage` to send these updates to HPKV. Each key-value pair is typically stored under a unique key within the specified `namespace` (e.g., `yourNamespace:yourStateKey`).

4.  **Receiving Remote Changes**:
    *   `HPKVStorage` subscribes to changes within its `namespace` (or specific keys if `subscribeToUpdatesFor` is used) on the HPKV server.
    *   When another client publishes a change, HPKV pushes this update to all subscribed clients via WebSocket.
    *   `HPKVStorage` receives the notification, processes it, and triggers an event.
    *   The `multiplayer` middleware listens for these events and updates the local Zustand store with the new data. A flag (`isUpdatingFromHPKV`) ensures that these updates don't trigger another publish cycle, preventing infinite loops.

5.  **Selective Sync**:
    *   The `publishUpdatesFor` option allows you to specify a function that returns an array of state keys. Only changes to these keys will be sent to other clients.
    *   The `subscribeToUpdatesFor` option allows you to specify a function that returns an array of state keys. The client will only receive updates for these keys from other clients.
    *   If these options are not provided, the middleware defaults to syncing all top-level non-function properties of your state.

Under the hood, `@hpkv/websocket-client` handles the complexities of WebSocket connections, message framing, and automatic reconnections, while `hpkvStorage.ts` adapts this for key-value storage and pub/sub patterns suitable for Zustand state. `token-helper.ts` provides the necessary mechanisms for secure token generation.

## License

MIT 