import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cache, CacheManager } from '../../src/utils/cache';

describe('Cache Unit Tests', () => {
  let cache: Cache<string, number>;

  beforeEach(() => {
    cache = new Cache<string, number>(3, 1000); // 3 items max, 1 second TTL for testing
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 100);
      expect(cache.get('key1')).toBe(100);
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should clear all entries', () => {
      cache.set('key1', 100);
      cache.set('key2', 200);
      expect(cache.size).toBe(2);

      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('should respect max size by evicting oldest entries', () => {
      cache.set('key1', 100);
      cache.set('key2', 200);
      cache.set('key3', 300);
      expect(cache.size).toBe(3);

      // Adding 4th item should evict first
      cache.set('key4', 400);
      expect(cache.size).toBe(3);
      expect(cache.get('key1')).toBeUndefined(); // Should be evicted
      expect(cache.get('key4')).toBe(400); // Should be present
    });

    it('should expire entries after TTL', () => {
      cache.set('key1', 100);
      expect(cache.get('key1')).toBe(100);

      // Fast-forward time by mocking Date.now
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 2000); // 2 seconds later

      expect(cache.get('key1')).toBeUndefined(); // Should be expired

      Date.now = originalNow; // Restore
    });
  });
});

describe('CacheManager Unit Tests', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = CacheManager.getInstance();
    cacheManager.clearAll(); // Clean state for each test
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CacheManager.getInstance();
      const instance2 = CacheManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Storage Key Cache', () => {
    it('should provide access to storage key cache', () => {
      cacheManager.storageKeyCache.set('test', 'value');
      expect(cacheManager.storageKeyCache.get('test')).toBe('value');
    });

    it('should clear all caches', () => {
      cacheManager.storageKeyCache.set('test', 'value');
      expect(cacheManager.storageKeyCache.size).toBe(1);

      cacheManager.clearAll();
      expect(cacheManager.storageKeyCache.size).toBe(0);
    });
  });
});
