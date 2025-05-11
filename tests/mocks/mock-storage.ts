import { SyncOptions } from '../../src/multiplayer';

const hpkvKeyValueStore = new Map<string, any>();
const listeners = new Map<string, Set<(event: any) => void>>();

export class MockHPKVStorage<TState> {
  options: Partial<SyncOptions<TState>>;
  constructor(options: Partial<SyncOptions<TState>>) {
    this.options = options;
  }
  getFullKey(key: string) {
    return `${this.options.namespace}:${key}`;
  }
  addListener(listener: (event: any) => void) {
    if (!this.options.namespace) {
      throw new Error('Namespace is required');
    }
    if (!listeners.has(this.options.namespace)) {
      listeners.set(this.options.namespace, new Set());
    }
    listeners.get(this.options.namespace)?.add(listener);
  }
  async getItem(key: string) {
    return Promise.resolve(hpkvKeyValueStore.get(this.getFullKey(key)));
  }
  async setItem(key: string, value: any) {
    return new Promise<void>(resolve => {
      console.log('');
      listeners.get(this.options.namespace || '')?.forEach(listener =>
        listener({
          key,
          value,
          timestamp: Date.now(),
        }),
      );
      hpkvKeyValueStore.set(this.getFullKey(key), value);
      resolve();
    });
  }
  async removeItem(key: string) {
    hpkvKeyValueStore.delete(this.getFullKey(key));
    listeners.get(this.options.namespace || '')?.forEach(listener =>
      listener({
        key,
        value: null,
        timestamp: Date.now(),
      }),
    );
    return Promise.resolve();
  }
  async getAllItems() {
    const filteredMap = new Map();
    hpkvKeyValueStore.forEach((value, key) => {
      if (this.options.namespace && key.startsWith(this.options.namespace)) {
        filteredMap.set(key.replace(this.options.namespace + ':', ''), value);
      }
    });
    return filteredMap;
  }
  close() {
    listeners.delete(this.options.namespace || '');
    return Promise.resolve();
  }
  clear() {
    hpkvKeyValueStore.forEach((_, key) => {
      if (this.options.namespace && key.startsWith(this.options.namespace)) {
        hpkvKeyValueStore.delete(key);
      }
    });
    return Promise.resolve();
  }
}
