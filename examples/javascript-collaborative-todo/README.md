# Zustand Multiplayer Express Starter

A collaborative Todo application built with Express.js and Zustand Multiplayer Middleware. This example demonstrates how to create a real-time multiplayer application where multiple users can manage todos together in real-time.

## Features

- **Real-time Collaboration**: Multiple users can add, toggle, and delete todos simultaneously
- **Responsive Design**: Clean, modern UI that works on all devices
- **Express.js Backend**: Secure token generation and API endpoints

## Prerequisites

- Node.js
- npm or yarn
- HPKV API credentials (get them from [hpkv.io](https://hpkv.io))

## Getting Started

### 1. Environment Setup

1. Copy the environment template:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` with your HPKV credentials:
   ```env
   # HPKV Configuration
   HPKV_API_KEY=your_hpkv_api_key_here
   HPKV_API_BASE_URL=your_hpkv_api_base_url_here
   
   # Server Configuration
   PORT=3000
   ```

### 2. Installation and Build

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the client bundle:
   ```bash
   npm run build
   ```

### 3. Running the Application

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

The application will be available at `http://localhost:3000`

## How It Works

### Server Architecture

The Express.js server provides three main functions:

#### 1. Token Generation Endpoint
```javascript
// server.js
const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY,
  process.env.HPKV_API_BASE_URL
);

app.post('/api/generate-token', async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const response = await tokenHelper.processTokenRequest(req.body);
  res.json(response);
});
```

This endpoint generates authentication tokens for the multiplayer service.

#### 2. Configuration Endpoint
```javascript
app.get('/api/config', (req, res) => {
  res.json({
    apiBaseUrl: process.env.HPKV_API_BASE_URL,
  });
});
```

Provides client-side configuration without exposing sensitive API keys.

### Client-Side Multiplayer Setup

#### 1. Store Creation with Multiplayer Middleware

```javascript
const todoStore = createStore(
        multiplayer(
          (set) => ({
            todos: {},

            addTodo: (text) =>
              set((state) => {
                const id = Date.now().toString();
                return {
                  ...state,
                  todos: {
                    ...state.todos,
                    [id]: {
                      id,
                      text,
                      completed: false,
                    }
                  }
                }
              }),
            toggleTodo: (id) =>
              set((state) => ({
                todos: {
                  ...state.todos,
                  [id]: {
                    ...state.todos[id],
                    completed: !state.todos[id].completed,
                  },
                },
              })),
            removeTodo: (id) =>
              set((state) => ({
                todos: Object.fromEntries(
                  Object.entries(state.todos).filter(([key]) => key !== id)
                ),
              })),
          }),
          {
            namespace: 'todo-store',
            tokenGenerationUrl: '/api/generate-token',
            apiBaseUrl: config.apiBaseUrl,
          }
        )
      );
```

#### Key Points:
- **Namespace**: Unique identifier for this store instance (`'todo-store'`)
- **Token Generation**: Points to the server endpoint that generates auth tokens
- **API Base URL**: The HPKV service endpoint for real-time synchronization

#### 2. Subscribing to State Changes

```javascript
todoStore.subscribe((state) => {
  renderTodos(state.todos);
  updateConnectionStatus(state.multiplayer);
});
```

The store automatically includes a `multiplayer` object in the state that provides:
- `connectionState`: Current connection status (`'CONNECTED'`, `'DISCONNECTED'`, etc.)
- Other multiplayer-specific metadata

#### 3. Connection Status Monitoring

```javascript
function updateConnectionStatus(multiplayer) {
  if (!multiplayer) return;
  
  const isConnected = multiplayer.connectionState === 'CONNECTED';
  
  connectionText.textContent = multiplayer.connectionState;
  statusIndicator.className = `status-indicator ${isConnected ? 'connected' : 'disconnected'}`;
}
```

This provides real-time feedback about the multiplayer connection status.

### Build Process

The application uses esbuild to bundle client-side dependencies:

```javascript
// scripts/client-entry.js
import { createStore } from 'zustand/vanilla';
import { multiplayer } from '@hpkv/zustand-multiplayer';

window.ZustandMultiplayer = {
  createStore,
  multiplayer
};
```

This creates a browser-compatible bundle that exposes the necessary Zustand and multiplayer functionality.

## Testing Multiplayer Functionality

1. Open the application in multiple browser tabs or windows
2. Add, toggle, or delete todos in one tab
3. Watch as changes appear instantly in all other tabs
4. Monitor the connection status indicator for real-time feedback

## Project Structure

```
express-starter/
├── server.js              # Express server setup
├── package.json           # Dependencies and scripts
├── bin/www               # Server startup script
├── scripts/              # Build scripts
│   ├── build-client.js   # esbuild configuration
│   └── client-entry.js   # Client-side bundle entry
├── public/               # Static assets
│   ├── index.html        # Main HTML file with embedded JS
│   ├── styles.css        # Application styles
│   └── dist/            # Built client bundle
└── .env                 # Environment configuration
```
