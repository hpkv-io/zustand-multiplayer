# How It Works

The middleware operates by integrating directly with Zustand's state management and HPKV's real-time messaging and persistence capabilities:

1.  **Initialization**:

    - When you create a store with the `multiplayer` middleware, it initializes `HPKVStorage` (`src/hpkvStorage.ts`).
    - `HPKVStorage` is responsible for all communication with the HPKV backend.
    - For client-side stores, it fetches a secure WebSocket token from your `tokenGenerationUrl`. For server-side stores, it uses the provided `apiKey` to generate a token via `TokenHelper` (`src/token-helper.ts`).
    - It then establishes a WebSocket connection to HPKV using the `@hpkv/websocket-client` library.

2.  **State Hydration**:

    - Upon connection (or reconnection), the middleware can hydrate the store's state by fetching all relevant data for the configured `namespace` from HPKV.

3.  **Local State Changes**:

    - When you update your Zustand store (e.g., using `set` or action calls), the `multiplayer` middleware intercepts these changes.
    - If the changed keys are configured to be published (via `publishUpdatesFor`, or by default all non-function keys), the middleware instructs `HPKVStorage` to send these updates to HPKV. Each key-value pair is typically stored under a unique key within the specified `namespace` (e.g., `yourNamespace:yourStateKey`).

4.  **Receiving Remote Changes**:

    - `HPKVStorage` subscribes to changes within its `namespace` (or specific keys if `subscribeToUpdatesFor` is used) on the HPKV server.
    - When another client publishes a change, HPKV pushes this update to all subscribed clients via WebSocket.
    - `HPKVStorage` receives the notification, processes it, and triggers an event.
    - The `multiplayer` middleware listens for these events and updates the local Zustand store with the new data. A flag (`isUpdatingFromHPKV`) ensures that these updates don't trigger another publish cycle, preventing infinite loops.

5.  **Selective Sync**:
    - The `publishUpdatesFor` option allows you to specify a function that returns an array of state keys. Only changes to these keys will be sent to other clients.
    - The `subscribeToUpdatesFor` option allows you to specify a function that returns an array of state keys. The client will only receive updates for these keys from other clients.
    - If these options are not provided, the middleware defaults to syncing all top-level non-function properties of your state.

Under the hood, `@hpkv/websocket-client` handles the complexities of WebSocket connections, message framing, and automatic reconnections, while `hpkvStorage.ts` adapts this for key-value storage and pub/sub patterns suitable for Zustand state. `token-helper.ts` provides the necessary mechanisms for secure token generation.
