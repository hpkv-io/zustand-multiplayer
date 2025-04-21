import http from 'http';

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React, { StrictMode, act } from 'react';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { create } from 'zustand';

import { multiplayer, StateWithMultiplayer } from '../src/multi-player';
import { TokenHelper } from '../src/token-helper';

import '@testing-library/jest-dom';
import { renderWithAsyncUpdates } from './test-utils';

// Simple deep merge function for tests
function deepMerge<T>(target: T, source: T): T {
  if (!target || !source) return source as T;
  if (typeof source !== 'object' || typeof target !== 'object') return source as T;

  const result = { ...target } as any;

  for (const key in source) {
    if (typeof source[key] === 'object' && source[key] !== null && target[key]) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result as T;
}

// Test server to provide token endpoint
const setupTestServer = () => {
  // Verify API key is not just defined but also not empty
  const apiKey = process.env.HPKV_API_KEY || 'missing-api-key';
  if (apiKey === 'missing-api-key' || apiKey.trim() === '') {
    console.warn('⚠️ WARNING: HPKV_API_KEY is not set or is empty. Token generation will fail.');
  }

  const tokenHelper = new TokenHelper(apiKey, process.env.HPKV_API_BASE_URL || '');

  const server = http.createServer(async (req, res) => {
    // Add CORS headers to prevent connection issues
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS request (preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only handle POST requests to /generate-token
    if (req.method === 'POST' && req.url === '/generate-token') {
      let body = '';

      // Collect request body
      req.on('data', chunk => {
        body += chunk.toString();
      });

      // Process the request
      req.on('end', async () => {
        try {
          console.log('Token generation request received:', body);
          const { storeName } = JSON.parse(body);

          if (!storeName) {
            console.error('Store name is missing in request');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Store name is required' }));
            return;
          }

          console.log(`Generating token for store: ${storeName}`);
          console.log(
            `Using API key: ${process.env.HPKV_API_KEY ? 'Available' : 'MISSING'}, Base URL: ${process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io'}`,
          );

          // Generate a token using the TokenHelper
          const token = await tokenHelper.generateTokenForStore(storeName);
          console.log(`Token generated successfully for ${storeName}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ token }));
        } catch (error) {
          console.error('Error generating token:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to generate token' }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  return server;
};

describe('multiplayer middleware', () => {
  let server: http.Server;
  let serverUrl: string;
  // Track all stores created during tests for cleanup
  const createdStores: Array<{
    getState: () => {
      multiplayer: {
        disconnect: () => Promise<void>;
        clearStorage: () => Promise<void>;
        isConnected: () => boolean;
      };
    };
  }> = [];

  // Helper to check if API key is properly set
  const validateApiKey = () => {
    const apiKey = process.env.HPKV_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      console.warn('⚠️ Skipping test: No valid HPKV_API_KEY provided');
      return false;
    }
    return true;
  };

  // Increase default test timeout
  vi.setConfig({ testTimeout: 10000 });

  // Helper to wait for promises to resolve
  const waitForPromises = () => new Promise(resolve => setTimeout(resolve, 2000));

  // Helper to wait for connection
  const waitForConnection = async (store: any, timeout = 2000) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (store.getState().multiplayer.isConnected()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  };

  // Set up test server before tests
  beforeAll(async () => {
    server = setupTestServer();
    await new Promise<void>(resolve => {
      server.listen(0, 'localhost', () => {
        const addr = server.address() as { port: number };
        serverUrl = `http://localhost:${addr.port}/generate-token`;
        resolve();
      });
    });
  });

  // Clean up after each test
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  // Shut down server and close all connections after all tests
  afterAll(async (done: any) => {
    // Ensure all async operations settle before disconnecting
    await waitForPromises();

    await Promise.all(
      createdStores.map(store => {
        if (store.getState().multiplayer.isConnected()) {
          return store.getState().multiplayer.clearStorage();
        }
      }),
    );

    await Promise.all(
      createdStores.map(store => {
        if (store.getState().multiplayer.isConnected()) {
          return store.getState().multiplayer.disconnect();
        }
      }),
    );

    // Clear the stores array for the next test
    createdStores.length = 0;
    await waitForPromises();
    server.close(done);
  });

  it('can create a store with multiplayer and rehydrate from HPKV', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    // Create store with multiplayer middleware
    const useMultiplayerStore = create<StateWithMultiplayer<{ count: number }>>()(
      multiplayer(() => ({ count: 0 }), {
        name: `test-mp-${Date.now()}`, // Use unique name for each test
        tokenGenerationUrl: serverUrl,
        apiBaseUrl: process.env.HPKV_BASE_URL || '',
        debug: true,
      }),
    );

    // Track store for cleanup
    createdStores.push(useMultiplayerStore);

    // Render a component using the store
    function Counter() {
      const { count } = useMultiplayerStore();
      return <div data-testid="count">count: {count}</div>;
    }

    render(
      <StrictMode>
        <Counter />
      </StrictMode>,
    );

    // Initial state should be rendered
    await screen.findByTestId('count');

    // Update state
    act(() => {
      useMultiplayerStore.setState({ count: 5 });
    });

    // Verify state update is rendered
    await screen.findByTestId('count');
    expect(screen.getByTestId('count').textContent).toBe('count: 5');
  });

  it('can connect multiple stores to the same state', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    const storeName = `test-mp-shared-${Date.now()}`;

    type StoreState = { count: number; increment: () => void };
    // Create first store instance
    const useStore1 = create<StateWithMultiplayer<StoreState>>()(
      multiplayer(
        (set: any) => ({
          count: 0,
          increment: () => set((state: StoreState) => ({ count: state.count + 1 })),
        }),
        {
          name: storeName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          debug: true,
          throttleDelay: 50, // Reduce throttle delay for faster synchronization
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useStore1);

    // Wait for first store to connect before creating second
    await waitForConnection(useStore1);
    await waitForPromises();

    // Create second store instance pointing to same storage
    const useStore2 = create<StateWithMultiplayer<StoreState>>()(
      multiplayer(
        (set: any) => ({
          count: 0,
          increment: () => set((state: StoreState) => ({ count: state.count + 1 })),
        }),
        {
          name: storeName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          debug: true,
          throttleDelay: 50, // Reduce throttle delay for faster synchronization
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useStore2);

    // Wait for second store to connect
    await waitForConnection(useStore2);

    // Modified component rendering to ensure text is in a single element
    function Store1Counter() {
      const store1 = useStore1();
      return (
        <>
          <div data-testid="store1-count">{`store1: ${store1.count}`}</div>
          <div data-testid="store1-state">{`${store1.multiplayer.isConnected()}`}</div>
          <button data-testid="store1-increment" onClick={() => store1.increment()}>
            Increment
          </button>
        </>
      );
    }

    function Store2Counter() {
      const store2 = useStore2();
      return (
        <>
          <div data-testid="store2-count">{`store2: ${store2.count}`}</div>
          <div data-testid="store2-state">{`${store2.multiplayer.isConnected()}`}</div>
        </>
      );
    }

    // Use async-safe render function
    await renderWithAsyncUpdates(
      <StrictMode>
        <Store1Counter />
        <Store2Counter />
      </StrictMode>,
    );

    // Initial state should be rendered in both
    expect(screen.getByTestId('store1-count').textContent).toBe('store1: 0');
    expect(screen.getByTestId('store2-count').textContent).toBe('store2: 0');
    expect(screen.getByTestId('store1-state').textContent).toBe('true');
    expect(screen.getByTestId('store2-state').textContent).toBe('true');

    await act(async () => {
      fireEvent.click(screen.getByTestId('store1-increment'));
      await waitForPromises();
      await useStore2.getState().multiplayer.rehydrate();
    });

    // Second store should eventually receive the update - check by test ID
    await waitFor(
      () => {
        expect(screen.getByTestId('store2-count').textContent).toBe('store2: 1');
      },
      { timeout: 5000 },
    ); // Increase timeout
  });

  it.skip('handles connection status correctly', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    // Create store with multiplayer middleware
    const useStore = create<StateWithMultiplayer<{ count: number }>>()(
      multiplayer(() => ({ count: 0 }), {
        name: `test-mp-connection-${Date.now()}`,
        tokenGenerationUrl: serverUrl,
        apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
        debug: true,
      }),
    );

    // Track store for cleanup
    createdStores.push(useStore);

    // Wait for connection establishment
    await waitForConnection(useStore);

    // Check connection status
    expect(useStore.getState().multiplayer.isConnected()).toBe(true);

    // Disconnect
    await useStore.getState().multiplayer.disconnect();

    // Check disconnected status
    expect(useStore.getState().multiplayer.isConnected()).toBe(false);
  });

  it('can set new options at runtime', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    // Create store with multiplayer middleware
    const useStore = create<StateWithMultiplayer<{ count: number }>>()(
      multiplayer(() => ({ count: 0 }), {
        name: `test-mp-options-${Date.now()}`,
        tokenGenerationUrl: serverUrl,
        apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
        debug: false,
        throttleDelay: 200,
      }),
    );

    // Track store for cleanup
    createdStores.push(useStore);

    // Get current options
    const initialOptions = useStore.getState().multiplayer.getOptions();
    expect(initialOptions.debug).toBe(false);
    expect(initialOptions.throttleDelay).toBe(200);

    // Update options
    useStore.getState().multiplayer.setOptions({
      debug: true,
      throttleDelay: 100,
    });

    // Verify options were updated
    const updatedOptions = useStore.getState().multiplayer.getOptions();
    expect(updatedOptions.debug).toBe(true);
    expect(updatedOptions.throttleDelay).toBe(100);
  });

  it('can skip hydration and manually rehydrate', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    const storeName = `test-mp-rehydrate-${Date.now()}`;
    type StoreState = { count: number; increment: () => void };
    // Create and setup first store to populate state
    const setupStore = create<StateWithMultiplayer<StoreState>>()(
      multiplayer(
        set => ({
          count: 0,
          increment: () => set((state: StoreState) => ({ count: state.count + 1 })),
        }),
        {
          name: storeName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          throttleDelay: 50,
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(setupStore);

    // Wait for connection and state persistence
    await waitForConnection(setupStore);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create second store with skipHydration
    const useStore = create<StateWithMultiplayer<StoreState>>()(
      multiplayer(
        set => ({
          count: 0,
          increment: () => set((state: StoreState) => ({ count: state.count + 1 })),
        }),
        {
          name: storeName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          skipHydration: true,
          throttleDelay: 50,
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useStore);

    // Wait for connection before rehydrating
    await waitForConnection(useStore);

    // Should still have initial state since hydration was skipped
    expect(useStore.getState().count).toBe(0);
    expect(useStore.getState().multiplayer.hasHydrated()).toBe(false);

    // Manually rehydrate
    setupStore.getState().increment();
    await waitForPromises();
    await useStore.getState().multiplayer.rehydrate();

    // Should now have state from HPKV
    await waitFor(
      () => {
        expect(useStore.getState().count).toBe(1);
        expect(useStore.getState().multiplayer.hasHydrated()).toBe(true);
      },
      { timeout: 5000 },
    );
  });

  it('calls hydration callbacks', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    const onHydrateSpy = vi.fn();
    const onFinishHydrationSpy = vi.fn();

    // Create store with multiplayer middleware
    const useStore = create<StateWithMultiplayer<{ count: number }>>()(
      multiplayer(() => ({ count: 0 }), {
        name: `test-mp-callbacks-${Date.now()}`,
        tokenGenerationUrl: serverUrl,
        apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
        throttleDelay: 50,
      }),
    );

    // Track store for cleanup
    createdStores.push(useStore);

    // Wait for connection before setting up listeners
    await waitForConnection(useStore);

    // Set up hydration listeners
    useStore.getState().multiplayer.onHydrate(onHydrateSpy);
    useStore.getState().multiplayer.onFinishHydration(onFinishHydrationSpy);

    // Trigger rehydration
    await useStore.getState().multiplayer.rehydrate();

    // Verify callbacks were called
    await waitFor(
      () => {
        expect(onHydrateSpy).toHaveBeenCalled();
        expect(onFinishHydrationSpy).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  });

  it('executes onRehydrateStorage callback properly', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    const storeName = `test-mp-onrehydrate-${Date.now()}`;

    // Setup a store to prepare initial data
    const setupStore = create<
      StateWithMultiplayer<{
        count: number;
        initialized: boolean;
        increment: () => void;
      }>
    >()(
      multiplayer(
        set => ({
          count: 5,
          initialized: false,
          increment: () => set(state => ({ count: state.count + 1 })),
        }),
        {
          name: storeName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          throttleDelay: 50,
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(setupStore);

    // Wait for connection and initial state to be saved
    await waitForConnection(setupStore);

    // Pre-hydration spy
    const preHydrationSpy = vi.fn();

    // Post-hydration spy will be called with the hydrated state
    const postHydrationSpy = vi.fn();

    setupStore.getState().increment();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create a store with onRehydrateStorage callback
    const useStore = create<
      StateWithMultiplayer<{
        count: number;
        initialized: boolean;
        increment: () => void;
        setInitialized: (initialized: boolean) => void;
      }>
    >()(
      multiplayer(
        set => ({
          count: 0,
          initialized: false,
          increment: () => set(state => ({ count: state.count + 1 })),
          setInitialized: (initialized: boolean) => set({ initialized }),
        }),
        {
          name: storeName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          throttleDelay: 50,
          onRehydrateStorage: state => {
            console.log('onRehydrateStorage', state);
            // Called before hydration
            preHydrationSpy(state);

            // Return a function that will be called after hydration
            return (hydratedState, error) => {
              if (error) {
                console.error('Hydration error:', error);
                return;
              }

              // Should be called with the hydrated state
              postHydrationSpy(hydratedState);

              // We can also update the state here
              if (hydratedState) {
                // Mark the store as initialized after hydration
                useStore.getState().setInitialized(true);
              }
            };
          },
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useStore);

    // Wait for connection before checking state
    await waitForConnection(useStore);

    // Wait for hydration to complete
    await waitFor(
      () => {
        expect(postHydrationSpy).toHaveBeenCalled();
        expect(useStore.getState().initialized).toBe(true);
      },
      { timeout: 5000 },
    );

    expect(postHydrationSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 6, // This came from the hydrated state
        initialized: false, // This should be false before our update
        increment: expect.any(Function),
      }),
    );

    // The initialized flag should now be set to true via our onRehydrateStorage callback
    expect(useStore.getState().initialized).toBe(true);
    expect(useStore.getState().count).toBe(6);

    // Verify the action from the original state still works
    act(() => {
      useStore.getState().increment();
    });

    expect(useStore.getState().count).toBe(7);
  });

  it('handles migration of state with complex objects', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    // Define interfaces for our state
    interface TodoV1 {
      id: string;
      text: string;
      done: boolean;
    }

    interface TodoV2 {
      id: string;
      text: string;
      completed: boolean;
      createdAt: number;
    }

    interface StateV1 {
      todos: TodoV1[];
      addTodo: (todo: TodoV1) => void;
    }

    interface StateV2 {
      todos: TodoV2[];
      filter: 'all' | 'active' | 'completed';
    }

    const uniqueName = `test-mp-migration-${Date.now()}`;

    // Create V1 store first
    const useStoreV1 = create<StateWithMultiplayer<StateV1>>()(
      multiplayer(
        set =>
          ({
            todos: [{ id: '1', text: 'Test Todo', done: true }],
            addTodo: (todo: TodoV1) => set((state: StateV1) => ({ todos: [...state.todos, todo] })),
          }) as StateV1,
        {
          name: uniqueName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          version: 1, // V1 of the schema
          throttleDelay: 50,
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useStoreV1);

    // Wait for connection and persistence
    await waitForConnection(useStoreV1);
    useStoreV1.getState().addTodo({ id: '2', text: 'Test Todo 2', done: false });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Ensure the V1 store is disconnected before creating V2
    await useStoreV1.getState().multiplayer.disconnect();
    await waitForPromises();

    // Create V2 store with migration
    const migrateSpy = vi.fn((state: unknown, version: number) => {
      // Migrate from V1 to V2
      if (version === 1) {
        const v1State = state as StateV1;
        const v2State: StateV2 = {
          todos: v1State.todos.map(todo => ({
            id: todo.id,
            text: todo.text,
            completed: todo.done, // renamed from 'done' to 'completed'
            createdAt: Date.now(), // new field
          })),
          filter: 'all', // new field
        };
        return v2State;
      }
      return state as StateV2;
    });

    const useStoreV2 = create<StateWithMultiplayer<StateV2>>()(
      multiplayer(
        () => ({
          todos: [],
          filter: 'all',
        }),
        {
          name: uniqueName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          version: 2, // V2 of the schema
          migrate: migrateSpy,
          throttleDelay: 50,
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useStoreV2);

    // Wait for connection
    await waitForConnection(useStoreV2);

    // Wait for migration to be called
    await waitFor(
      () => {
        expect(migrateSpy).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );

    // Verify migration happened
    expect(migrateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        todos: [
          { id: '1', text: 'Test Todo', done: true },
          { id: '2', text: 'Test Todo 2', done: false },
        ],
      }),
      1,
    );

    // Verify migrated state structure
    const state = useStoreV2.getState();
    expect(state.todos[0].completed).toBe(true); // was 'done' in V1
    expect(state.todos[0].createdAt).toBeDefined(); // new in V2
    expect(state.filter).toBe('all'); // new in V2
  });

  it('correctly handles partial state updates with non-serializable objects', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    interface ComplexState {
      regularValue: number;
      dateValue: Date;
      mapValue: Map<string, string>;
      someFunction?: () => void;
      setRegularValue: (value: number) => void;
    }

    const uniqueName = `test-mp-complex-${Date.now()}`;

    // Create store with partialize to exclude non-serializable values
    const useComplexStore = create<StateWithMultiplayer<ComplexState>>()(
      multiplayer(
        set => ({
          regularValue: 0,
          dateValue: new Date(),
          mapValue: new Map([['key1', 'value1']]),
          someFunction: () => console.log('test'),
          setRegularValue: (value: number) => set({ regularValue: value }),
        }),
        {
          name: uniqueName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          throttleDelay: 50,
          // Only persist serializable values
          partialize: state => ({
            regularValue: state.regularValue,
            dateValue: state.dateValue,
            // Convert Map to array for storage
            mapValue: Array.from(state.mapValue.entries()),
          }),
          // Custom merge function to handle special types
          merge: (persisted: any, current: ComplexState) => {
            return {
              ...current,
              ...persisted,
              // Convert back to Map
              mapValue:
                persisted.mapValue instanceof Map
                  ? persisted.mapValue
                  : new Map(persisted.mapValue),
              // Keep the function from current state
              someFunction: current.someFunction,
            };
          },
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useComplexStore);

    // Wait for connection
    await waitForConnection(useComplexStore);
    await waitForPromises();

    // Update regularValue
    act(() => {
      useComplexStore.getState().setRegularValue(42);
    });

    // Wait for state to be persisted
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Disconnect first store explicitly before creating second
    await useComplexStore.getState().multiplayer.disconnect();
    await waitForPromises();

    // Create a second instance to verify complex state is preserved
    const useComplexStore2 = create<StateWithMultiplayer<ComplexState>>()(
      multiplayer(
        set => ({
          regularValue: 0,
          dateValue: new Date(),
          mapValue: new Map(),
          someFunction: () => console.log('default'),
          setRegularValue: (value: number) => set({ regularValue: value }),
        }),
        {
          name: uniqueName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          throttleDelay: 50,
          partialize: state =>
            ({
              regularValue: state.regularValue,
              dateValue: state.dateValue,
              mapValue: Array.from(state.mapValue.entries()),
            }) as any,
          merge: (persisted: any, current: ComplexState) => {
            return {
              ...current,
              ...persisted,
              mapValue:
                persisted.mapValue instanceof Map
                  ? persisted.mapValue
                  : new Map(persisted.mapValue),
              someFunction: current.someFunction,
            };
          },
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useComplexStore2);

    // Wait for connection
    await waitForConnection(useComplexStore2);

    // Wait for hydration
    await waitFor(
      () => {
        // Verify regularValue was persisted
        expect(useComplexStore2.getState().regularValue).toBe(42);
      },
      { timeout: 5000 },
    );

    // Verify Map structure was preserved
    const map = useComplexStore2.getState().mapValue;
    expect(map).toBeInstanceOf(Map);
    expect(map.get('key1')).toBe('value1');

    // Verify function exists but is the one from initial state
    expect(useComplexStore2.getState().someFunction).toBeDefined();
  });

  it.skip('handles error scenarios and retries appropriately', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    // Mock console.error to track error logging
    const originalConsoleError = console.error;
    const mockConsoleError = vi.fn();
    console.error = mockConsoleError;

    try {
      // Create a store with invalid API URL to trigger errors
      const useErrorStore = create<StateWithMultiplayer<{ count: number }>>()(
        multiplayer(() => ({ count: 0 }), {
          name: `test-mp-error-${Date.now()}`,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: 'https://invalid-url.example.com', // Invalid URL to trigger connection errors
          debug: true,
          maxRetries: 2, // Set a low retry count
          retryDelay: 50, // Fast retry for test
        }),
      );

      // Track store for cleanup
      createdStores.push(useErrorStore);

      // Wait to allow retries to occur
      await waitForConnection(useErrorStore);

      // Verify that errors were logged
      expect(mockConsoleError).toHaveBeenCalled();

      // Verify that the store still functions locally even when connection fails
      act(() => {
        useErrorStore.setState({ count: 5 });
      });

      expect(useErrorStore.getState().count).toBe(5);
    } finally {
      // Restore original console.error
      console.error = originalConsoleError;
    }
  });

  it('clears storage correctly using clearStorage API', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    const storeName = `test-mp-clear-storage-${Date.now()}`;

    // Create first store and add data
    const useFirstStore = create<StateWithMultiplayer<{ count: number }>>()(
      multiplayer(() => ({ count: 42 }), {
        name: storeName,
        tokenGenerationUrl: serverUrl,
        apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
        debug: true,
        throttleDelay: 50,
      }),
    );

    // Track store for cleanup
    createdStores.push(useFirstStore);

    // Wait for connection and data persistence
    await waitForConnection(useFirstStore);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Clear storage using the API
    await useFirstStore.getState().multiplayer.clearStorage();

    // Disconnect first store
    await useFirstStore.getState().multiplayer.disconnect();

    // Create second store to check if data was cleared
    const useSecondStore = create<StateWithMultiplayer<{ count: number }>>()(
      multiplayer(() => ({ count: 0 }), {
        name: storeName,
        tokenGenerationUrl: serverUrl,
        apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
        debug: true,
        throttleDelay: 50,
      }),
    );

    // Track store for cleanup
    createdStores.push(useSecondStore);

    // Wait for connection and hydration
    await waitForConnection(useSecondStore);
    await waitForPromises();

    // Verify data was cleared (should have initial value, not 42)
    expect(useSecondStore.getState().count).toBe(0);
  });

  it('handles custom deep merging for complex nested objects', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    // Use our custom deep merge function defined at the top of the file
    // const deepMerge = createDeepMerge({ all: true });

    // Define a complex nested state type
    type DeepState = {
      config: {
        appearance: {
          theme: string;
          fontSize: number;
          colors: {
            primary: string;
            secondary: string;
          };
        };
        settings: {
          notifications: boolean;
          privacy: {
            shareData: boolean;
            cookies: string[];
          };
        };
      };
      updateTheme: (theme: string) => void;
    };

    const storeName = `test-mp-deep-merge-${Date.now()}`;

    // Create first store with initial state
    const useDeepStore1 = create<StateWithMultiplayer<DeepState>>()(
      multiplayer(
        set => ({
          config: {
            appearance: {
              theme: 'light',
              fontSize: 14,
              colors: {
                primary: '#1a73e8',
                secondary: '#188038',
              },
            },
            settings: {
              notifications: true,
              privacy: {
                shareData: false,
                cookies: ['necessary'],
              },
            },
          },
          updateTheme: theme =>
            set(state => ({
              config: {
                ...state.config,
                appearance: {
                  ...state.config.appearance,
                  theme,
                },
              },
            })),
        }),
        {
          name: storeName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          debug: true,
          throttleDelay: 50,
          merge: (persistedState, currentState) =>
            deepMerge(currentState, persistedState as DeepState) as DeepState,
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useDeepStore1);

    // Wait for connection
    await waitForConnection(useDeepStore1);

    // Update a deeply nested property
    act(() => {
      useDeepStore1.getState().updateTheme('dark');
    });

    // Wait for state to be persisted
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create second store to verify deep merge works
    const useDeepStore2 = create<StateWithMultiplayer<DeepState>>()(
      multiplayer(
        set => ({
          config: {
            appearance: {
              theme: 'system', // Different default
              fontSize: 16, // Different default
              colors: {
                primary: '#ffffff',
                secondary: '#cccccc',
              },
            },
            settings: {
              notifications: false, // Different default
              privacy: {
                shareData: true, // Different default
                cookies: ['marketing'], // Different default
              },
            },
          },
          updateTheme: theme =>
            set(state => ({
              config: {
                ...state.config,
                appearance: {
                  ...state.config.appearance,
                  theme,
                },
              },
            })),
        }),
        {
          name: storeName,
          tokenGenerationUrl: serverUrl,
          apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
          debug: true,
          throttleDelay: 50,
          merge: (persistedState, currentState) =>
            deepMerge(currentState, persistedState as DeepState) as DeepState,
        },
      ),
    );

    // Track store for cleanup
    createdStores.push(useDeepStore2);

    // Wait for connection and hydration
    await waitForConnection(useDeepStore2);
    await waitFor(
      () => {
        // Theme should be updated from store1
        expect(useDeepStore2.getState().config.appearance.theme).toBe('dark');
      },
      { timeout: 5000 },
    );

    // Check that other deep properties were merged correctly
    const state = useDeepStore2.getState();
    expect(state.config.appearance.colors.primary).toBe('#1a73e8');
    expect(state.config.appearance.colors.secondary).toBe('#188038');
    expect(state.config.settings.privacy.shareData).toBe(false);
  });

  it('throttles updates to reduce network traffic', async () => {
    // Skip if no API key is provided
    if (!validateApiKey()) return;

    const storeName = `test-mp-throttle-${Date.now()}`;

    // Create a simple store with throttling
    const useThrottleStore = create<StateWithMultiplayer<{ count: number }>>()(
      multiplayer(() => ({ count: 0 }), {
        name: storeName,
        tokenGenerationUrl: serverUrl,
        apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
        throttleDelay: 500, // Set a high throttle delay for testing
      }),
    );

    // Track store for cleanup
    createdStores.push(useThrottleStore);

    // Wait for connection
    await waitForConnection(useThrottleStore);

    // Rapid updates within throttle window
    act(() => {
      useThrottleStore.setState({ count: 1 });
      useThrottleStore.setState({ count: 2 });
      useThrottleStore.setState({ count: 3 });
      useThrottleStore.setState({ count: 4 });
      useThrottleStore.setState({ count: 5 });
    });

    // Check that local state is updated immediately
    expect(useThrottleStore.getState().count).toBe(5);

    // Wait for less than throttle delay
    await new Promise(resolve => setTimeout(resolve, 200));

    // Update again while previous throttle is still pending
    act(() => {
      useThrottleStore.setState({ count: 10 });
    });

    // Wait for throttle to complete
    await new Promise(resolve => setTimeout(resolve, 600));

    // Create a second store to verify only the latest update was persisted
    const useThrottleStore2 = create<StateWithMultiplayer<{ count: number }>>()(
      multiplayer(() => ({ count: 0 }), {
        name: storeName,
        tokenGenerationUrl: serverUrl,
        apiBaseUrl: process.env.HPKV_BASE_URL || 'https://api-eu-1.hpkv.io',
      }),
    );

    // Track store for cleanup
    createdStores.push(useThrottleStore2);

    // Wait for connection and hydration
    await waitForConnection(useThrottleStore2);

    // Wait for hydration
    await waitFor(
      () => {
        expect(useThrottleStore2.getState().count).toBe(10);
      },
      { timeout: 5000 },
    );
  });
});
