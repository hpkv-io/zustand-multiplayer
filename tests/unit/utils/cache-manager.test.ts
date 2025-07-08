import { describe, it, expect, beforeEach } from 'vitest';
import { 
  LRUCache, 
  WeakCache, 
  CacheManager,
  PathExtractionCache,
  DeepEqualityCache
} from '../../../src/utils/cache-manager';

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>({ maxSize: 3 });
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 100);
      expect(cache.get('key1')).toBe(100);
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if keys exist', () => {
      cache.set('key1', 100);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 100);
      expect(cache.has('key1')).toBe(true);
      
      cache.delete('key1');
      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should clear all entries', () => {
      cache.set('key1', 100);
      cache.set('key2', 200);
      expect(cache.size).toBe(2);
      
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });
  });

  describe('LRU Behavior', () => {
    it('should evict least recently used items when capacity is exceeded', () => {
      cache.set('key1', 100);
      cache.set('key2', 200);
      cache.set('key3', 300);
      expect(cache.size).toBe(3);
      
      // Adding a 4th item should evict the first
      cache.set('key4', 400);
      expect(cache.size).toBe(3);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    it('should update LRU order on access', () => {
      cache.set('key1', 100);
      cache.set('key2', 200);
      cache.set('key3', 300);
      
      // Access key1 to make it recently used
      cache.get('key1');
      
      // Adding a 4th item should now evict key2 (least recently used)
      cache.set('key4', 400);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track cache size', () => {
      expect(cache.size).toBe(0);
      
      cache.set('key1', 100);
      expect(cache.size).toBe(1);
      
      cache.set('key2', 200);
      expect(cache.size).toBe(2);
      
      cache.delete('key1');
      expect(cache.size).toBe(1);
    });

    it('should provide statistics', () => {
      cache.set('key1', 100);
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.5, 1);
    });
  });
});

describe('WeakCache', () => {
  let cache: WeakCache<object, string>;
  let obj1: object;
  let obj2: object;

  beforeEach(() => {
    cache = new WeakCache();
    obj1 = { id: 1 };
    obj2 = { id: 2 };
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values with object keys', () => {
      cache.set(obj1, 'value1');
      expect(cache.get(obj1)).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get(obj1)).toBeUndefined();
    });

    it('should check if keys exist', () => {
      cache.set(obj1, 'value1');
      expect(cache.has(obj1)).toBe(true);
      expect(cache.has(obj2)).toBe(false);
    });

    it('should delete keys', () => {
      cache.set(obj1, 'value1');
      expect(cache.has(obj1)).toBe(true);
      
      cache.delete(obj1);
      expect(cache.has(obj1)).toBe(false);
      expect(cache.get(obj1)).toBeUndefined();
    });
  });
});

describe('PathExtractionCache', () => {
  let cache: PathExtractionCache;

  beforeEach(() => {
    cache = new PathExtractionCache();
  });

  it('should cache path extraction results', () => {
    const state = { user: { name: 'John' } };
    const paths = [{ path: ['user', 'name'], value: 'John' }];
    
    // Set cache entry
    cache.set(state, [], paths);
    
    // Get cache entry
    const result = cache.get(state, []);
    expect(result).toEqual(paths);
  });

  it('should handle different parent paths', () => {
    const state = { user: { name: 'John' } };
    const paths1 = [{ path: ['user', 'name'], value: 'John' }];
    const paths2 = [{ path: ['profile', 'name'], value: 'John' }];
    
    cache.set(state, [], paths1);
    cache.set(state, ['profile'], paths2);
    
    expect(cache.get(state, [])).toEqual(paths1);
    expect(cache.get(state, ['profile'])).toEqual(paths2);
  });

  it('should clear cache', () => {
    const state = { user: { name: 'John' } };
    cache.set(state, [], []);
    
    cache.clear();
    expect(cache.get(state, [])).toBeUndefined();
  });
});

describe('DeepEqualityCache', () => {
  let cache: DeepEqualityCache;

  beforeEach(() => {
    cache = new DeepEqualityCache();
  });

  it('should cache equality comparisons', () => {
    const obj1 = { name: 'John' };
    const obj2 = { name: 'John' };
    
    // First call should miss cache
    expect(cache.get(obj1, obj2)).toBeUndefined();
    
    // Set result
    cache.set(obj1, obj2, true);
    
    // Second call should hit cache
    expect(cache.get(obj1, obj2)).toBe(true);
  });

  it('should handle false equality results', () => {
    const obj1 = { name: 'John' };
    const obj2 = { name: 'Jane' };
    
    cache.set(obj1, obj2, false);
    expect(cache.get(obj1, obj2)).toBe(false);
  });
});

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = CacheManager.getInstance();
    cacheManager.clearAll();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CacheManager.getInstance();
      const instance2 = CacheManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Cache Access', () => {
    it('should provide access to all cache types', () => {
      expect(cacheManager.pathExtractionCache).toBeDefined();
      expect(cacheManager.deepEqualityCache).toBeDefined();
      expect(cacheManager.storageKeyCache).toBeDefined();
      expect(cacheManager.stateReconstructionCache).toBeDefined();
    });

    it('should allow storage key caching', () => {
      const path = 'user:name';
      const fullKey = 'namespace:user:name';
      
      cacheManager.storageKeyCache.set(path, fullKey);
      expect(cacheManager.storageKeyCache.get(path)).toBe(fullKey);
    });

    it('should allow state reconstruction caching', () => {
      const stateKey = 'state-key';
      const reconstructedState = { user: { name: 'John' } };
      
      cacheManager.stateReconstructionCache.set(stateKey, reconstructedState);
      expect(cacheManager.stateReconstructionCache.get(stateKey)).toBe(reconstructedState);
    });
  });

  describe('Cache Management', () => {
    it('should clear all caches', () => {
      // Populate caches
      cacheManager.storageKeyCache.set('key1', 'value1');
      cacheManager.stateReconstructionCache.set('key2', {});
      
      const state = { test: true };
      cacheManager.pathExtractionCache.set(state, [], []);
      cacheManager.deepEqualityCache.set({ a: 1 }, { a: 1 }, true);
      
      // Clear all
      cacheManager.clearAll();
      
      // Verify all caches are empty
      expect(cacheManager.storageKeyCache.size).toBe(0);
      expect(cacheManager.stateReconstructionCache.size).toBe(0);
      expect(cacheManager.pathExtractionCache.get(state, [])).toBeUndefined();
      expect(cacheManager.deepEqualityCache.get({ a: 1 }, { a: 1 })).toBeUndefined();
    });

    it('should provide comprehensive statistics', () => {
      // Add some cache entries
      cacheManager.storageKeyCache.set('path1', 'key1');
      cacheManager.storageKeyCache.set('path2', 'key2');
      
      const stats = cacheManager.getAllStats();
      
      expect(stats.storageKey.size).toBe(2);
      expect(stats.pathExtraction).toBeDefined();
      expect(stats.deepEquality).toBeDefined();
      expect(stats.stateReconstruction).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle many cache operations efficiently', () => {
      const startTime = performance.now();
      
      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        cacheManager.storageKeyCache.set(`key${i}`, `value${i}`);
        cacheManager.storageKeyCache.get(`key${i}`);
      }
      
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });
  });
}); 