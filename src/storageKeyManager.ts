/**
 * Manages storage keys and key mappings for the multiplayer system.
 * Consolidates all logic for converting between state paths and database keys.
 */
export class StorageKeyManager<TState = any> {
  constructor(private namespace: string) {}

  /**
   * Create a storage key from a path array
   * @param path Array of path segments
   * @returns Full storage key with namespace
   */
  createStorageKey(path: string[]): string {
    return `${this.namespace}:${path.join(':')}`;
  }

  /**
   * Parse a storage key to extract path information
   * @param storageKey The full storage key
   * @returns Object with path array and granularity information
   */
  parseStorageKey(storageKey: string): { path: string[]; isGranular: boolean } {
    const prefix = `${this.namespace}:`;
    let keyToParse = storageKey;
    
    // Remove namespace prefix if present
    if (storageKey.startsWith(prefix)) {
      keyToParse = storageKey.substring(prefix.length);
    }

    const path = keyToParse.split(':');
    const isGranular = path.length > 1;
    
    return { path, isGranular };
  }

  /**
   * Prefixes a key with the namespace
   * @param key Key to prefix
   * @returns Full key with namespace prefix
   */
  getFullKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * Removes the namespace prefix from a full key
   * @param fullKey Key with namespace prefix
   * @returns Key without namespace prefix
   */
  getKeyWithoutPrefix(fullKey: string): string {
    const prefix = `${this.namespace}:`;
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
    if (key.startsWith(`${this.namespace}:`)) {
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
    if (key.startsWith(`${this.namespace}:`)) {
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
  filterItemsByPublishedKeys<T extends { key: string; value: any }>(
    items: T[],
    publishedKeys: string[]
  ): T[] {
    return items.filter(item => {
      const keyParts = item.key.split(':');
      const rootKey = keyParts[0];
      
      // Check if the root key is in publishedKeys (for granular nested fields)
      // or if the entire key is in publishedKeys (for top-level fields)
      return publishedKeys.includes(rootKey) || publishedKeys.includes(item.key);
    });
  }

  /**
   * Gets the namespace for this key manager
   * @returns The namespace string
   */
  getNamespace(): string {
    return this.namespace;
  }

  /**
   * Creates a range query pattern for namespace
   * @returns Object with start and end patterns for range queries
   */
  getNamespaceRange(): { start: string; end: string } {
    return {
      start: `${this.namespace}:`,
      end: `${this.namespace}:\xff`
    };
  }
} 