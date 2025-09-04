/**
 * Simple cache implementation for storage key caching
 */
export class Cache<K, V> {
  private readonly data = new Map<K, { value: V; expires: number }>();
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(maxSize = 1000, ttl = 300000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: K): V | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
      this.data.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.data.size >= this.maxSize) {
      const firstKey = this.data.keys().next().value;
      if (firstKey !== undefined) {
        this.data.delete(firstKey);
      }
    }

    this.data.set(key, {
      value,
      expires: Date.now() + this.ttl,
    });
  }

  clear(): void {
    this.data.clear();
  }

  get size(): number {
    return this.data.size;
  }
}

export class CacheManager {
  private static instance: CacheManager;
  public readonly storageKeyCache = new Cache<string, string>();

  private constructor() {}

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  clearAll(): void {
    this.storageKeyCache.clear();
  }
}

export function getCacheManager(): CacheManager {
  return CacheManager.getInstance();
}
