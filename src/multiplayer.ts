import { ConnectionConfig, ConnectionStats } from '@hpkv/websocket-client';
import { StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand/vanilla';
import { createHPKVStorage, HPKVChangeEvent, HPKVStorage } from './hpkvStorage';

export type MultiplayerOptions<S> = {
  namespace: string;
  apiBaseUrl: string;
  apiKey?: string;
  tokenGenerationUrl?: string;
  clientConfiguration?: ConnectionConfig;
  publishUpdatesFor?: () => Array<keyof S>;
  subscribeToUpdatesFor?: () => Array<keyof S>;
  onHydrate?: (state: S) => void;
};

export type Write<T, U> = Omit<T, keyof U> & U;

export type WithMultiplayer<S, A> = S extends { getState: () => infer T }
  ? Write<S, MultiplayerStore<T, A>>
  : never;

export type MultiplayerStore<T, P = T> = {
  multiplayer: {
    getSubscribedState: () => Promise<P>;
    hydrate: () => Promise<void>;
    clearStorage: () => Promise<void>;
    disconnect: () => Promise<void>;
    getConnectionStatus: () => ConnectionStats | null;
  };
};

type Multiplayer = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  U = T,
>(
  initializer: StateCreator<T, [...Mps, ['zustand/multiplayer', unknown]], Mcs>,
  options: MultiplayerOptions<T>,
) => StateCreator<T, Mps, [['zustand/multiplayer', U], ...Mcs]>;

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    'zustand/multiplayer': WithMultiplayer<S, A>;
  }
}

type MultiplayerMiddleware = <TState extends object>(
  config: StateCreator<TState, [], []>,
  options: MultiplayerOptions<TState>,
) => StateCreator<TState, [], []>;

const impl: MultiplayerMiddleware = (config, options) => (set, get, api) => {
  type TState = ReturnType<typeof config>;

  const setItem = () => {
    const state = { ...get() };
    return client.setItem(options.namespace, state);
  };

  const configResult = config(
    (...args) => {
      set(...(args as Parameters<typeof set>));
      void setItem();
    },
    get,
    api,
  );

  const initialState = (get() || configResult) as Record<string, unknown>;
  const nonFunctionKeys = Object.keys(initialState).filter(
    key => typeof initialState[key] !== 'function',
  );
  const syncOptions: MultiplayerOptions<TState> = {
    subscribeToUpdatesFor: () => nonFunctionKeys as (keyof TState)[],
    publishUpdatesFor: () => nonFunctionKeys as (keyof TState)[],
    ...options,
  };

  const client: HPKVStorage<TState> = createHPKVStorage(syncOptions);

  client.addListener((event: HPKVChangeEvent) => {
    api.setState({ [event.key]: event.value } as Partial<TState>, false);
  });

  // Initialize the store
  const store = config(
    <A extends TState | Partial<TState> | ((state: TState) => TState | Partial<TState>)>(
      partial: A,
      replace?: boolean,
    ) => {
      const nextState =
        typeof partial === 'function'
          ? (partial as (state: TState) => TState | Partial<TState>)(get())
          : partial;

      // Update local state
      if (replace === true) {
        api.setState(nextState as TState, true);
      } else {
        api.setState(nextState as TState | Partial<TState>, false);
      }

      // Sync changed state to HPKV
      const keysToSync = Object.keys(nextState as object);
      keysToSync.forEach(key => {
        const value = (nextState as any)[key];
        client.setItem(key, value).catch(error => console.error(`Failed to set ${key}:`, error));
      });
    },
    get,
    api,
  );

  const hydrate = async () => {
    const state = await client.getAllItems();
    options.onHydrate?.(state as TState);
    state.forEach((value, key) => {
      if ((typeof value === 'string' && value.length === 0) || value === null) {
        return;
      }
      api.setState({ [key]: value } as Partial<TState>, false);
    });
  };

  (api as StoreApi<TState> & MultiplayerStore<TState>).multiplayer = {
    getSubscribedState: async () => {
      const allItems = await client.getAllItems();
      return Object.fromEntries(allItems.entries()) as TState;
    },
    hydrate: async () => {
      await hydrate();
    },
    clearStorage: async () => {
      await client.clear();
    },
    disconnect: async () => {
      await client.close();
    },
    getConnectionStatus: () => client.getConnectionStatus(),
  };

  hydrate();

  return store;
};

export const multiplayer = impl as unknown as Multiplayer;
