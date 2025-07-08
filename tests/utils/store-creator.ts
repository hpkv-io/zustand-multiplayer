import {
  MultiplayerOptions,
  MultiplayerState,
  WithMultiplayer,
  ImmerStateCreator,
  WithMultiplayerMiddleware,
} from '../../src/types/multiplayer-types';
import { LogLevel } from '../../src/monitoring/logger';
import { create, StoreApi, UseBoundStore } from 'zustand';
import { createUniqueStoreName } from './test-utils';
import { multiplayer } from '../../src/multiplayer';

const defaultMultiplayerOptions = {
  apiKey: 'test-api-key',
  apiBaseUrl: 'hpkv-base-api-url',
  logLevel: LogLevel.DEBUG,
};

export class StoreCreator {
  private storeRegistry: Map<
    string,
    UseBoundStore<StoreApi<any>>
  > = new Map();

  createStore<T>(
    config: ImmerStateCreator<T, [['zustand/multiplayer', unknown]], []>,
    options?: Partial<MultiplayerOptions<T>> | MultiplayerOptions<T>,
  ): UseBoundStore<WithMultiplayerMiddleware<StoreApi<WithMultiplayer<T>>, WithMultiplayer<T>>> {
    const namespace = createUniqueStoreName('test-namespace');
    const opts = { namespace, ...defaultMultiplayerOptions, ...options };
    const store = create<WithMultiplayer<T>>()(multiplayer(config, opts));
    this.storeRegistry.set(
      opts.namespace,
      store,
    );
    return store;
  }

  async cleanupStore<T>(store: UseBoundStore<StoreApi<T & { multiplayer: MultiplayerState<T> }>>) {
    const state = store.getState();
    try {
      await state.multiplayer.clearStorage();
      await state.multiplayer.destroy();
    } catch (error) {
      // Ignore cleanup errors - they're expected in some test scenarios
      console.warn('Store cleanup failed (expected in mock scenarios):', error.message);
    }
    await state.multiplayer.disconnect();
  }

  async cleanupAllStores() {
    for (const store of this.storeRegistry.values()) {
      await this.cleanupStore(store);
    }
    this.storeRegistry.clear();
  }
}
