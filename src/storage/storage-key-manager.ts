import type { StatePath } from '../core/state-manager';
import { createPath } from '../core/state-manager';
import { getCacheManager } from '../utils/cache-manager';

/**
 * Generic storage item interface
 */
export interface StorageItem<T = unknown> {
  key: string;
  value: T;
}

/**
 * Storage key parsing result
 */
export interface ParsedStorageKey {
  path: string[];
}

/**
 * Namespace range query pattern
 */
export interface NamespaceRange {
  start: string;
  end: string;
}

/**
 * Manages storage keys and key mappings for the multiplayer system.
 */
export class StorageKeyManager {
  private readonly cacheManager = getCacheManager();
  private readonly namespacedPrefix: string;

  constructor(
    private readonly namespace: string,
    private readonly zFactor?: number,
  ) {
    this.namespacedPrefix = zFactor !== undefined ? `${namespace}-${zFactor}` : namespace;
  }

  /**
   * Create a storage key from a path array with caching
   * @param path Array of path segments
   * @returns Full storage key with namespace
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
   * @param storageKey The full storage key
   * @returns Object with path array and granularity information
   */
  parseStorageKey(storageKey: string): StatePath {
    const prefix = `${this.namespacedPrefix}:`;
    let keyToParse = storageKey;

    if (storageKey.startsWith(prefix)) {
      keyToParse = storageKey.substring(prefix.length);
    }

    const path = keyToParse.split(':');
    const statePath = createPath(path);

    return statePath;
  }

  /**
   * Prefixes a key with the namespace
   * @param key Key to prefix
   * @returns Full key with namespace prefix
   */
  getFullKey(key: string): string {
    return `${this.namespacedPrefix}:${key}`;
  }

  /**
   * Removes the namespace prefix from a full key
   * @param fullKey Key with namespace prefix
   * @returns Key without namespace prefix
   */
  getKeyWithoutPrefix(fullKey: string): string {
    const prefix = `${this.namespacedPrefix}:`;
    if (fullKey.startsWith(prefix)) {
      return fullKey.substring(prefix.length);
    }
    return fullKey;
  }

  /**
   * Checks if a logical key is allowed to be published based on published keys patterns
   * @param logicalKey The key to check (without namespace)
   * @param publishedKeys Array of allowed key patterns
   * @returns True if the key is allowed to be published
   */
  isKeyAllowedToPublish(logicalKey: string, publishedKeys: string[]): boolean {
    return publishedKeys.some(
      publishedKey => logicalKey.startsWith(`${publishedKey}:`) || logicalKey === publishedKey,
    );
  }

  /**
   * Extracts the logical key from a storage key (removing namespace if present)
   * @param key The key that may or may not have namespace prefix
   * @returns The logical key without namespace
   */
  extractLogicalKey(key: string): string {
    if (key.startsWith(`${this.namespacedPrefix}:`)) {
      return this.getKeyWithoutPrefix(key);
    }
    return key;
  }

  /**
   * Ensures a key has the namespace prefix (adds it if not present)
   * @param key The key to ensure has namespace
   * @returns Key with namespace prefix
   */
  ensureNamespacePrefix(key: string): string {
    if (key.startsWith(`${this.namespacedPrefix}:`)) {
      return key;
    }
    return this.getFullKey(key);
  }

  /**
   * Filters items based on published keys permissions
   * @param items Array of items with key and value
   * @param publishedKeys Array of allowed key patterns
   * @returns Filtered items that match published keys
   */
  filterItemsByPublishedKeys<T extends StorageItem>(items: T[], publishedKeys: string[]): T[] {
    return items.filter(item => {
      const keyParts = item.key.split(':');
      const rootKey = keyParts[0];

      return publishedKeys.includes(rootKey) || publishedKeys.includes(item.key);
    });
  }

  /**
   * Gets the namespace for this key manager
   * @returns The namespace string
   */
  getNamespace(): string {
    return this.namespacedPrefix;
  }

  /**
   * Creates a range query pattern for namespace
   * @returns Object with start and end patterns for range queries
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
