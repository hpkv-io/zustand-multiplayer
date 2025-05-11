import { multiplayer, MultiplayerOptions, MultiplayerStore, Write } from '../../src/multiplayer';
import { create, StoreApi, UseBoundStore } from 'zustand';
import { StateCreator } from 'zustand';
import { createUniqueStoreName } from './test-utils';

const defaultMultiplayerOptions = {
  apiKey: 'test-api-key',
  apiBaseUrl: 'http://localhost:3000',
};

export class StoreCreator {
  private storeRegistry: Map<
    string,
    UseBoundStore<Write<StoreApi<unknown>, MultiplayerStore<unknown>>>
  > = new Map();

  createStore<T>(
    config: StateCreator<T, [['zustand/multiplayer', unknown]], []>,
    options?: Partial<MultiplayerOptions<T>> | MultiplayerOptions<T>,
  ) {
    const namespace = createUniqueStoreName('test-namespace');
    const opts = { namespace, ...defaultMultiplayerOptions, ...options };
    const store = create<T>()(multiplayer(config, opts));
    this.storeRegistry.set(opts.namespace, store);
    return store;
  }

  async cleanupStore<T>(store: UseBoundStore<Write<StoreApi<T>, MultiplayerStore<T>>>) {
    await store.multiplayer.clearStorage();
    await store.multiplayer.disconnect();
  }

  async cleanupAllStores() {
    for (const store of this.storeRegistry.values()) {
      await this.cleanupStore(store);
    }
    this.storeRegistry.clear();
  }
}
