# Zustand Multiplayer Middleware

[![npm version](https://img.shields.io/npm/v/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)
[![npm downloads](https://img.shields.io/npm/dm/@hpkv/zustand-multiplayer.svg)](https://www.npmjs.com/package/@hpkv/zustand-multiplayer)

A real-time synchronization middleware for [Zustand](https://github.com/pmndrs/zustand) that uses [HPKV](https://hpkv.io)'s [WebSocket API](https://hpkv.io/docs/websocket-api) for storage and real-time updates across clients.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Introduction](#introduction)
  - [How It Works](#how-it-works)
  - [Use Cases](#use-cases)
- [Usage](#usage)
  - [Creating a multiplayer store](#creating-a-multiplayer-store)
  - [Setting up the token generation endpoint](#setting-up-the-token-endpoint)
  - [Persisting state partially](#persisting-state-partially)
  - [Custom state merging with deep objects](#custom-state-merging-with-deep-objects)
  - [Managing connection status](#managing-connection-status)
  - [Error handling and retries](#error-handling-and-retries)
  - [Migration between versions](#migration-between-versions)
- [Troubleshooting](#troubleshooting)
  - [Common issues](#common-issues)
  - [Debug mode](#debug-mode)
- [API Reference](#api-reference)
  - [Types](#types)
  - [multiplayer(stateCreatorFn, options)](#multiplayerstateccreatorfn-options)
- [License](#license)

## Features

- **Real-time state synchronization** between multiple clients
- **Persistent state storage** using HPKV WebSocket API
- **Support for versioning and migrations**
- **Connection status management** with automatic reconnection
- **Throttling** to optimize network traffic
- **TypeScript support** with full type definitions
- **Custom merge strategies** for combining remote and local state
- **Partial state persistence** with the partialize option

## Prerequisites

1. **HPKV Account**: Sign up for a free HPKV account at [https://hpkv.io/signup](https://hpkv.io/signup)
2. **API Key**: Create an API key in the [HPKV Dashboard](https://hpkv.io/dashboard/api-keys)
3. **API Base URL**: Note your API Base URL from the dashboard API keys section

You can find both your API key and base URL in the [HPKV Dashboard API Keys section](https://hpkv.io/dashboard/api-keys).

## Installation

```bash
npm install @hpkv/zustand-multiplayer
```

## Introduction

The `multiplayer` middleware extends [Zustand](https://github.com/pmndrs/zustand) with powerful real-time synchronization capabilities, enabling seamless state sharing across multiple clients. While Zustand excels at managing local state, this middleware bridges the gap to distributed state management by leveraging [HPKV](https://hpkv.io)'s WebSocket API.

### How It Works

At its core, the middleware:

1. **Automatically synchronizes state changes** across all connected clients in real-time
2. **Persists state** to HPKV's high-performance storage
3. **Rehydrates state** when clients reconnect or when the page loads
4. **Handles connection management**, including reconnection attempts and error handling
5. **Provides APIs** for monitoring connection status and controlling synchronization

The implementation is built on a client-server architecture where:
- Each client connects to HPKV via WebSockets using secure tokens
- State changes are automatically propagated to all connected clients
- The server acts as both a persistence layer and a real-time message broker

Basic usage is straightforward:

```js
const nextStateCreatorFn = multiplayer(stateCreatorFn, multiplayerOptions)
```

### Use Cases

This middleware is ideal for a wide range of applications:

#### 1. Collaborative Tools
- **Document editors**: Multiple users editing the same document simultaneously
- **Whiteboards**: Shared drawing and diagramming with real-time updates
- **Project management**: Task boards with real-time updates across team members

#### 2. Multi-device Experiences
- **Cross-device applications**: Seamlessly continue work across phone, tablet, and desktop
- **Shared shopping carts**: Synchronized shopping experience across devices
- **Settings synchronization**: Keep user preferences consistent across all devices

#### 3. Real-time Applications
- **Chat applications**: Instant messaging with presence indicators
- **Live dashboards**: Data visualization that updates in real-time for all viewers
- **Multiplayer games**: Synchronized game state across players

## Usage

### Creating a multiplayer store

#### TypeScript Example
```ts
import { create } from 'zustand'
import { multiplayer, StateWithMultiplayer } from '@hpkv/zustand-multiplayer'

// Define your store type
type CounterStore = {
  count: number
  increment: () => void
  decrement: () => void
}

// Create a store with multiplayer middleware
const useCounterStore = create<StateWithMultiplayer<CounterStore>>()(
  multiplayer(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
      decrement: () => set((state) => ({ count: state.count - 1 })),
    }),
    {
      name: 'counter-store',
      tokenGenerationUrl: 'your-token-generation-endpoint',
      apiBaseUrl: 'your-hpkv-api-base-url',
    }
  )
)
```

#### JavaScript Example
```js
import { create } from 'zustand'
import { multiplayer } from '@hpkv/zustand-multiplayer'

// Create a store with multiplayer middleware
const useCounterStore = create(
  multiplayer(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
      decrement: () => set((state) => ({ count: state.count - 1 })),
    }),
    {
      name: 'counter-store',
      tokenGenerationUrl: 'your-token-generation-endpoint',
      apiBaseUrl: 'your-hpkv-api-base-url',
    }
  )
)
```

### Setting up the token endpoint

You need to create a token generation endpoint that will be called by the middleware. The middleware provides a `TokenHelper` class to make this easier. There are helper methods to make creating endpoints easier for various frameworks. See the [Token API Documentation](/docs/TOKEN_API.md) for more details.

```ts
// Example Express endpoint
import express from 'express'
import { TokenHelper } from '@hpkv/zustand-multiplayer'

const app = express()
app.use(express.json())

app.post('/token', async (req, res) => {
  const { storeName } = req.body

  const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY,
  process.env.HPKV_API_BASE_URL
)
  
  try {
    const token = await tokenHelper.generateTokenForStore(storeName)
    
    res.json({ storeName, token })
  } catch (error) {
    console.error('Token generation error:', error)
    res.status(500).json({ error: 'Failed to generate token' })
  }
})

app.listen(3000)
```

### Persisting state partially

Sometimes you might want to persist only specific parts of your state. An example is the situations that you want part of the state to be shared across all clients and part of it to be specific to a client.

#### Real-world use cases:

1. **User sessions with shared data**: In a collaborative document editor, you might want to sync the document content across all clients but keep each user's selection, cursor position, and UI preferences local.

2. **Multi-player games**: Sync the game state (positions, scores) while keeping client-specific data (input buffers, local settings) separate.

3. **Form applications**: Sync form data but keep validation states, loading indicators, and temporary user actions local.

You can use the `partialize` option to specify exactly which parts of the state should be shared:

```ts
const useEditorStore = create<StateWithMultiplayer<EditorState>>()(
  multiplayer(
    (set) => ({
      // Shared state
      document: { 
        content: "",
        lastModified: null,
        version: 1
      },
      // Client-specific state
      ui: { 
        selectedText: "", 
        cursorPosition: { line: 0, column: 0 },
        sidebarOpen: false 
      },
      isLoading: false,
      
      // Actions...
      updateContent: (content) => set(state => ({ 
        document: { 
          ...state.document, 
          content,
          lastModified: new Date()
        }
      })),
    }),
    {
      name: 'collaborative-editor',
      tokenGenerationUrl: 'your-token-generation-endpoint',
      apiBaseUrl: 'your-hpkv-api-base-url',
      // Only sync the document part, not UI state or loading indicators
      partialize: (state) => ({
        document: state.document
      }),
    }
  )
)
```

With this setup, when any client calls `updateContent()`, only the document data will be synchronized across all clients, while each client maintains its own UI state. This reduces network traffic and prevents unnecessary UI updates across clients.

### Custom state merging with deep objects

When working with deeply nested state objects, the default shallow merge strategy might not be sufficient. Deep merging becomes essential when you need to preserve nested structures while updating only specific parts.

#### Real-world use cases:

1. **User preferences with multiple categories**: An application with extensive user settings grouped into categories (appearance, privacy, notifications, etc.) that need to be merged properly.

2. **Complex application configurations**: Apps with layered configurations where different clients might update different sections of the config, requiring proper merging.

3. **Dashboard layouts**: Apps with customizable dashboards where widgets can be arranged and configured independently.

```ts
import { create } from 'zustand'
import { multiplayer, StateWithMultiplayer } from '@hpkv/zustand-multiplayer'
import createDeepMerge from '@fastify/deepmerge'

// Create a deep merge utility
const deepMerge = createDeepMerge({ all: true })

// Define your state type with nested structures
type AppSettings = {
  config: {
    appearance: { 
      theme: 'light' | 'dark' | 'system',
      fontSize: number,
      accentColor: string,
      animations: boolean
    },
    privacy: { 
      shareUsageData: boolean,
      storeHistory: boolean,
      cookiePreferences: {
        analytics: boolean,
        marketing: boolean,
        necessary: boolean
      }
    },
    notifications: {
      email: boolean,
      push: boolean,
      frequency: 'immediate' | 'daily' | 'weekly'
    }
  },
  updateAppearance: (appearance: Partial<AppSettings['config']['appearance']>) => void
}

const useSettingsStore = create<StateWithMultiplayer<AppSettings>>()(
  multiplayer(
    (set) => ({
      // Deeply nested initial state
      config: {
        appearance: { 
          theme: 'light', 
          fontSize: 14,
          accentColor: '#3498db',
          animations: true
        },
        privacy: { 
          shareUsageData: false,
          storeHistory: true,
          cookiePreferences: {
            analytics: false,
            marketing: false,
            necessary: true
          }
        },
        notifications: {
          email: true,
          push: false,
          frequency: 'daily'
        }
      },
      
      // Action to update just a portion of the appearance settings
      updateAppearance: (appearance) => set(state => ({
        config: {
          ...state.config,
          appearance: {
            ...state.config.appearance,
            ...appearance
          }
        }
      }))
    }),
    {
      name: 'app-settings',
      tokenGenerationUrl: 'your-token-generation-endpoint',
      apiBaseUrl: 'your-hpkv-api-base-url',
      // Custom merge function to properly handle deep objects
      merge: (persistedState, currentState) => 
        deepMerge(currentState, persistedState) as AppSettings
    }
  )
)
```

With this setup, when a user changes their theme on one device, only that part of the deeply nested configuration gets updated across all instances of the application. The `merge` function ensures all levels of nesting are properly combined when state is rehydrated from storage or received from other clients.

This approach is particularly valuable for applications with complex configuration options where different parts of the configuration might be modified independently by different clients.

### Managing connection status

```tsx
import React, { useState, useEffect } from 'react';
import { create } from 'zustand';
import { multiplayer, StateWithMultiplayer } from '@hpkv/zustand-multiplayer';

// Define your store type
type CollaborativeStore = {
  document: {
    content: string;
    lastModified: Date | null;
  };
  updateContent: (content: string) => void;
};

// Create the store with multiplayer
const useDocStore = create<StateWithMultiplayer<CollaborativeStore>>()(
  multiplayer(
    (set) => ({
      document: {
        content: '',
        lastModified: null,
      },
      updateContent: (content) => 
        set(state => ({ 
          document: {
            content,
            lastModified: new Date(),
          }
        })),
    }),
    {
      name: 'collaborative-doc',
      tokenGenerationUrl: 'your-token-generation-endpoint',
      apiBaseUrl: 'your-hpkv-api-base-url',
    }
  )
);

// Connection status component with automatic reconnection
function ConnectionStatusBar() {
  const { multiplayer } = useDocStore();
  const [isConnected, setIsConnected] = useState(multiplayer?.isConnected() ?? false);
  
  // Poll connection status
  useEffect(() => {
    if(multiplayer){
      setIsConnected(multiplayer.isConnected());
    }
    
    // Set up polling interval
    const interval = setInterval(() => {
      const connected = multiplayer.isConnected();
      setIsConnected(connected);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [multiplayer]);
  
  
  return (
      <div>
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>
  );
}

```

This implementation provides users with real-time feedback about their connection status, shows when data was last synchronized, and offers a manual reconnection option. This pattern is essential for collaborative applications where users need to know if their changes are being synchronized with other clients.

The connection status component can be extended with additional features like automatic reconnection attempts with exponential backoff, offline mode indicators, or sync progress visualization for large state updates.

### Error handling and retries

The middleware includes built-in error handling and retry logic for network operations:

```ts
const useStore = create<StateWithMultiplayer<MyState>>()(
  multiplayer(
    (set) => ({
      // Your store state
    }),
    {
      name: 'resilient-store',
      tokenGenerationUrl: 'your-token-generation-endpoint',
      apiBaseUrl: 'your-hpkv-api-base-url',
      // Configure retry behavior
      maxRetries: 5,
      retryDelay: 300
    }
  )
)
```

### Migration between versions

When you need to make breaking changes to your store, you can use versioning and migrations:

```ts
const useStore = create<StateWithMultiplayer<MyState>>()(
  multiplayer(
    (set) => ({
      user: { name: '', preferences: {} },
    }),
    {
      name: 'versioned-store',
      tokenGenerationUrl: 'your-token-generation-endpoint',
      apiBaseUrl: 'your-hpkv-api-base-url',
      version: 2, // Current version
      migrate: (persistedState, version) => {
        // Migrate from version 1 to 2
        if (version === 1) {
          return {
            user: {
              name: persistedState.username || '',
              preferences: persistedState.settings || {},
            }
          }
        }
        return persistedState as MyState
      }
    }
  )
)
```

## Troubleshooting

### Common issues

1. **Missing connection**: Ensure `tokenGenerationUrl` and `apiBaseUrl` are correctly configured.

2. **Token errors**: Verify your token generation endpoint is working correctly and returning valid tokens.

3. **Hydration issues**: If state isn't persisting, check browser console for errors and verify that all required options are provided.

### Debug mode

Enable debug logging to see what's happening under the hood:

```ts
const useStore = create<StateWithMultiplayer<MyState>>()(
  multiplayer(
    (set) => ({ /* state */ }),
    {
      name: 'debug-store',
      tokenGenerationUrl: 'your-token-generation-endpoint',
      apiBaseUrl: 'your-hpkv-api-base-url',
      debug: true // Enable debug logs
    }
  )
)
```

## API Reference

### Types

#### Signature

```ts
multiplayer<T>(stateCreatorFn: StateCreator<T, [], []>, options: MultiplayerOptions<T>): StateCreator<StateWithMultiplayer<T>, [], []>
```

#### State with Multiplayer

```ts
type StateWithMultiplayer<T> = T & {
  multiplayer: MultiplayerApi<T>;
};
```

### multiplayer(stateCreatorFn, options)

#### Parameters

* `stateCreatorFn`: A function that takes `set` function, `get` function and `store` as arguments. Usually, you will return an object with the methods you want to expose.
* `options`: An object to define storage and synchronization options.
  * `name`: A unique name for your store (required).
  * `tokenGenerationUrl`: URL endpoint that generates HPKV tokens (required).
  * `apiBaseUrl`: Base URL for the HPKV WebSocket API (required).
  * **optional** `partialize`: A function to filter state fields before persisting.
  * **optional** `onRehydrateStorage`: A function or function returning a function that allows custom logic before and after state rehydration.
  * **optional** `version`: A version number for the persisted state.
  * **optional** `migrate`: A function to migrate persisted state for version mismatches.
  * **optional** `merge`: A function for custom logic when merging persisted state with the current state.
  * **optional** `skipHydration`: Defaults to `false`. If `true`, the middleware won't automatically rehydrate the state on initialization.
  * **optional** `debug`: Enables debug logging when `true`.
  * **optional** `throttleDelay`: Milliseconds to throttle state updates (default: 100).
  * **optional** `maxRetries`: Maximum number of retries for operations (default: 3).
  * **optional** `retryDelay`: Delay between retries in milliseconds (default: 100).

#### Returns

`multiplayer` adds a `multiplayer` property to your store with the following API:

* `setOptions(options)`: Update middleware options.
* `clearStorage()`: Clear the persisted state.
* `rehydrate()`: Manually trigger state rehydration.
* `hasHydrated()`: Check if the store has been hydrated.
* `onHydrate(callback)`: Register a listener for hydration start.
* `onFinishHydration(callback)`: Register a listener for hydration completion.
* `getOptions()`: Get current middleware options.
* `isConnected()`: Get the connection status.
* `disconnect()`: Manually disconnect from the WebSocket.

## License

MIT 