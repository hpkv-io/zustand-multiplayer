import { SerializableValue } from '../types/multiplayer-types';
import { getCurrentTimestamp } from './index';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache configuration options
 */
interface CacheConfig {
  maxSize?: number;
  ttl?: number;
  cleanupInterval?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  totalAccesses: number;
}

// ============================================================================
// LRU CACHE IMPLEMENTATION
// ============================================================================

/**
 * High-performance LRU cache with TTL support
 */
export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxSize: number;
  private ttl: number;
  private cleanupInterval: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalAccesses: 0,
  };

  constructor(config: CacheConfig = {}) {
    this.maxSize = config.maxSize || 1000;
    this.ttl = config.ttl || 5 * 60 * 1000; // 5 minutes default
    this.cleanupInterval = config.cleanupInterval || 60 * 1000; // 1 minute default

    this.startCleanupTimer();
  }

  /**
   * Get value from cache
   */
  get(key: K): V | undefined {
    this.stats.totalAccesses++;

    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessed = getCurrentTimestamp();

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: K, value: V): void {
    const now = getCurrentTimestamp();

    // If key already exists, update it
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      entry.value = value;
      entry.timestamp = now;
      entry.lastAccessed = now;

      // Move to end
      this.cache.delete(key);
      this.cache.set(key, entry);
      return;
    }

    // Check size limit
    if (this.cache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
    });
  }

  /**
   * Delete value from cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.stats.totalAccesses > 0 ? this.stats.hits / this.stats.totalAccesses : 0,
      evictions: this.stats.evictions,
      totalAccesses: this.stats.totalAccesses,
    };
  }

  /**
   * Get all keys in cache
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values in cache
   */
  values(): V[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    return getCurrentTimestamp() - entry.timestamp > this.ttl;
  }

  /**
   * Evict least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = getCurrentTimestamp();
    const keysToDelete: K[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.totalAccesses = 0;
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}

// ============================================================================
// WEAK REFERENCE CACHE
// ============================================================================

/**
 * WeakMap-based cache for object references
 */
export class WeakCache<K extends object, V> {
  private cache = new WeakMap<K, V>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
  };

  /**
   * Get value from cache
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);

    if (value !== undefined) {
      this.stats.hits++;
      return value;
    }

    this.stats.misses++;
    return undefined;
  }

  /**
   * Set value in cache
   */
  set(key: K, value: V): void {
    this.cache.set(key, value);
    this.stats.sets++;
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete value from cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? this.stats.hits / (this.stats.hits + this.stats.misses)
          : 0,
    };
  }
}

// ============================================================================
// SPECIALIZED CACHES
// ============================================================================

/**
 * Cache for path extraction results
 */
export class PathExtractionCache {
  private cache = new LRUCache<string, Array<{ path: string[]; value: SerializableValue }>>();
  private hashCache = new WeakCache<object, string>();

  /**
   * Get cached path extraction result
   */
  get(
    obj: object,
    parentPath: string[] = [],
  ): Array<{ path: string[]; value: SerializableValue }> | undefined {
    const key = this.generateKey(obj, parentPath);
    return this.cache.get(key);
  }

  /**
   * Set cached path extraction result
   */
  set(
    obj: object,
    parentPath: string[] = [],
    result: Array<{ path: string[]; value: SerializableValue }>,
  ): void {
    const key = this.generateKey(obj, parentPath);
    this.cache.set(key, result);
  }

  /**
   * Generate cache key for object and parent path
   */
  private generateKey(obj: object, parentPath: string[]): string {
    const objHash = this.getObjectHash(obj);
    const pathKey = parentPath.join(':');
    return `${objHash}:${pathKey}`;
  }

  /**
   * Get or create hash for object
   */
  private getObjectHash(obj: object): string {
    const cached = this.hashCache.get(obj);
    if (cached) return cached;

    const hash = this.createObjectHash(obj);
    this.hashCache.set(obj, hash);
    return hash;
  }

  /**
   * Create simple hash for object
   */
  private createObjectHash(obj: object): string {
    try {
      const str = JSON.stringify(obj);
      let hash = 0;

      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }

      return hash.toString(36);
    } catch {
      return Date.now().toString(36) + Math.random().toString(36);
    }
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      pathCache: this.cache.getStats(),
      hashCache: this.hashCache.getStats(),
    };
  }
}

/**
 * Cache for deep equality comparisons
 */
export class DeepEqualityCache {
  private cache = new LRUCache<string, boolean>();

  /**
   * Get cached deep equality result
   */
  get(a: any, b: any): boolean | undefined {
    const key = this.generateKey(a, b);
    return this.cache.get(key);
  }

  /**
   * Set cached deep equality result
   */
  set(a: any, b: any, result: boolean): void {
    const key = this.generateKey(a, b);
    this.cache.set(key, result);
  }

  /**
   * Generate cache key for comparison
   */
  private generateKey(a: any, b: any): string {
    try {
      const keyA = typeof a === 'object' ? JSON.stringify(a) : String(a);
      const keyB = typeof b === 'object' ? JSON.stringify(b) : String(b);

      // Sort keys to ensure consistent ordering
      return keyA < keyB ? `${keyA}:${keyB}` : `${keyB}:${keyA}`;
    } catch {
      // Fallback for circular references
      return `${Date.now()}:${Math.random()}`;
    }
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }
}

// ============================================================================
// CACHE MANAGER
// ============================================================================

/**
 * Central cache manager that coordinates all caches
 */
export class CacheManager {
  private static instance: CacheManager;

  public readonly pathExtractionCache = new PathExtractionCache();
  public readonly deepEqualityCache = new DeepEqualityCache();
  public readonly storageKeyCache = new LRUCache<string, string>();
  public readonly stateReconstructionCache = new LRUCache<string, any>();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.pathExtractionCache.clear();
    this.deepEqualityCache.clear();
    this.storageKeyCache.clear();
    this.stateReconstructionCache.clear();
  }

  /**
   * Get statistics from all caches
   */
  getAllStats() {
    return {
      pathExtraction: this.pathExtractionCache.getStats(),
      deepEquality: this.deepEqualityCache.getStats(),
      storageKey: this.storageKeyCache.getStats(),
      stateReconstruction: this.stateReconstructionCache.getStats(),
    };
  }

  /**
   * Destroy all caches and cleanup resources
   */
  destroy(): void {
    this.pathExtractionCache.clear();
    this.deepEqualityCache.clear();
    this.storageKeyCache.destroy();
    this.stateReconstructionCache.destroy();
  }
}

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

/**
 * Get global cache manager instance
 */
export function getCacheManager(): CacheManager {
  return CacheManager.getInstance();
}

/**
 * Create a new LRU cache with default configuration
 */
export function createLRUCache<K, V>(config?: CacheConfig): LRUCache<K, V> {
  return new LRUCache<K, V>(config);
}

/**
 * Create a new weak cache
 */
export function createWeakCache<K extends object, V>(): WeakCache<K, V> {
  return new WeakCache<K, V>();
}
