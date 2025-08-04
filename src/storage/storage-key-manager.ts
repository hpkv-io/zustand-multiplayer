import { getCacheManager } from '../utils/cache';

export interface StatePath {
  segments: string[];
  depth: number;
  isNested: boolean;
}

export interface NamespaceRange {
  start: string;
  end: string;
}

/**
 * Manages storage keys and key mappings for the multiplayer.
 */
export class StorageKeyManager {
  private readonly cacheManager = getCacheManager();
  private readonly namespacedPrefix: string;

  constructor(namespace: string, zFactor?: number) {
    this.namespacedPrefix = zFactor !== undefined ? `${namespace}-${zFactor}` : namespace;
  }

  /**
   * Create a storage key from a path array with caching
   */
  createStorageKey(path: string[]): string {
    const pathKey = path.join(':');
    const cacheKey = `${this.namespacedPrefix}:${pathKey}`;

    const cached = this.cacheManager.storageKeyCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = `${this.namespacedPrefix}:${pathKey}`;

    this.cacheManager.storageKeyCache.set(cacheKey, result);

    return result;
  }

  /**
   * Parse a storage key to extract path information
   */
  parseStorageKey(storageKey: string): StatePath {
    const prefix = `${this.namespacedPrefix}:`;
    let keyToParse = storageKey;

    if (storageKey.startsWith(prefix)) {
      keyToParse = storageKey.substring(prefix.length);
    }

    const segments = keyToParse.split(':');

    return {
      segments,
      depth: segments.length,
      isNested: segments.length > 1,
    };
  }

  /**
   * Prefixes a key with the namespace
   */
  getFullKey(key: string): string {
    return `${this.namespacedPrefix}:${key}`;
  }

  /**
   * Removes the namespace prefix from a full key
   */
  getKeyWithoutPrefix(fullKey: string): string {
    const prefix = `${this.namespacedPrefix}:`;
    if (fullKey.startsWith(prefix)) {
      return fullKey.substring(prefix.length);
    }
    return fullKey;
  }

  /**
   * Gets the namespace for this key manager
   */
  getNamespace(): string {
    return this.namespacedPrefix;
  }

  /**
   * Creates a range query pattern for namespace
   */
  getNamespaceRange(): NamespaceRange {
    return {
      start: `${this.namespacedPrefix}:`,
      end: `${this.namespacedPrefix}:\xff`,
    };
  }

  /**
   * Clear the storage key cache
   */
  clearCache(): void {
    this.cacheManager.storageKeyCache.clear();
  }
}
