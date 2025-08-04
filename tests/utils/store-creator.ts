import type { StoreApi, UseBoundStore, StateCreator } from 'zustand';
import { create } from 'zustand';
import { LogLevel } from '../../src/monitoring/logger';
import { multiplayer } from '../../src/multiplayer';
import type {
  MultiplayerOptions,
  MultiplayerStoreApi,
  WithMultiplayer,
} from '../../src/types/multiplayer-types';
import { createUniqueStoreName } from './test-utils';

const defaultMultiplayerOptions = {
  apiKey: 'test-api-key',
  apiBaseUrl: 'https://localhost',
  logLevel: LogLevel.DEBUG,
  clientConfig: {
    throttling: {
      enabled: true,
      rateLimit: 20,
    },
  },
};

export class StoreCreator {
  private readonly storeRegistry: Map<string, UseBoundStore<StoreApi<unknown>>> = new Map();

  createStore<T>(
    config: StateCreator<T, [], []>,
    options?: Partial<MultiplayerOptions<T>> | MultiplayerOptions<T>,
  ): UseBoundStore<MultiplayerStoreApi<WithMultiplayer<T>>> {
    const namespace = createUniqueStoreName('test-namespace');
    const opts = { namespace, ...defaultMultiplayerOptions, ...options } as MultiplayerOptions<
      Omit<T, 'multiplayer'>
    >;
    const store = create<WithMultiplayer<T>>()(multiplayer(config, opts));
    this.storeRegistry.set(opts.namespace, store);
    return store;
  }

  async cleanupStore<T>(store: UseBoundStore<MultiplayerStoreApi<WithMultiplayer<T>>>) {
    try {
      await store.multiplayer.clearStorage();
      await store.multiplayer.disconnect();
      await store.multiplayer.destroy();
    } catch (error) {
      console.error('Error cleaning up store:', error);
    }
  }

  async cleanupAllStores() {
    for (const store of this.storeRegistry.values()) {
      await this.cleanupStore(
        store as UseBoundStore<MultiplayerStoreApi<WithMultiplayer<unknown>>>,
      );
    }
    this.storeRegistry.clear();
  }
}
