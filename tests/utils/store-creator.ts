import {
  multiplayer,
  MultiplayerOptions,
  MultiplayerState,
  WithMultiplayer,
} from '../../src/multiplayer';
import { LogLevel } from '../../src/logger';
import { create, StoreApi, UseBoundStore } from 'zustand';
import { StateCreator } from 'zustand';
import { createUniqueStoreName } from './test-utils';

const defaultMultiplayerOptions = {
  apiKey: 'test-api-key',
  apiBaseUrl: 'hpkv-base-api-url',
  logLevel: LogLevel.DEBUG,
};

export class StoreCreator {
  private storeRegistry: Map<
    string,
    UseBoundStore<StoreApi<unknown & { multiplayer: MultiplayerState }>>
  > = new Map();

  createStore<T>(
    config: StateCreator<T, [['zustand/multiplayer', unknown]], []>,
    options?: Partial<MultiplayerOptions<T>> | MultiplayerOptions<T>,
  ): UseBoundStore<StoreApi<T & { multiplayer: MultiplayerState }>> {
    const namespace = createUniqueStoreName('test-namespace');
    const opts = { namespace, ...defaultMultiplayerOptions, ...options };
    const store = create<WithMultiplayer<T>>()(multiplayer(config, opts));
    this.storeRegistry.set(
      opts.namespace,
      store as UseBoundStore<StoreApi<unknown & { multiplayer: MultiplayerState }>>,
    );
    return store;
  }

  async cleanupStore<T>(store: UseBoundStore<StoreApi<T & { multiplayer: MultiplayerState }>>) {
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
