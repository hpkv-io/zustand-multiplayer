import { memoize, getCacheManager, CacheStats } from './cache-manager';
import { PathManager, StatePath } from './path-manager';
import { SerializableValue } from '../types/multiplayer-types';

// ============================================================================
// SPECIALIZED MEMOIZATION DECORATORS
// ============================================================================

/**
 * Memoize path extraction operations
 */
export function MemoizePathExtraction(maxSize: number = 100, ttl: number = 5 * 60 * 1000) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = memoize(originalMethod, {
      maxSize,
      ttl,
      keyGenerator: (obj: any, parentPath: string[] = []) => {
        // Create a stable key for the object and parent path
        const objStr = JSON.stringify(obj);
        const pathStr = parentPath.join(':');
        return `${objStr}:${pathStr}`;
      }
    });
    
    return descriptor;
  };
}

/**
 * Memoize deep equality operations
 */
export function MemoizeDeepEqual(maxSize: number = 500, ttl: number = 2 * 60 * 1000) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = memoize(originalMethod, {
      maxSize,
      ttl,
      keyGenerator: (a: any, b: any) => {
        // Create a stable key for the comparison
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
    });
    
    return descriptor;
  };
}

/**
 * Memoize storage key operations
 */
export function MemoizeStorageKey(maxSize: number = 200, ttl: number = 10 * 60 * 1000) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = memoize(originalMethod, {
      maxSize,
      ttl,
      keyGenerator: (...args: any[]) => {
        // For storage keys, use a simple string concatenation
        return args.map(arg => String(arg)).join(':');
      }
    });
    
    return descriptor;
  };
}

/**
 * Memoize state reconstruction operations
 */
export function MemoizeStateReconstruction(maxSize: number = 50, ttl: number = 1 * 60 * 1000) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = memoize(originalMethod, {
      maxSize,
      ttl,
      keyGenerator: (items: Map<string, unknown>) => {
        // Create a hash from the items map
        const entries = Array.from(items.entries()).sort();
        return JSON.stringify(entries);
      }
    });
    
    return descriptor;
  };
}

/**
 * Memoize with object reference caching
 */
export function MemoizeWithWeakRef(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  
  descriptor.value = memoize(originalMethod, {
    weakRef: true
  });
  
  return descriptor;
}

// ============================================================================
// FUNCTION-LEVEL MEMOIZATION UTILITIES
// ============================================================================

/**
 * Create a memoized version of extractPaths function
 */
export function createMemoizedExtractPaths<T>(
  extractPathsFunction: (obj: T, parentPath?: string[], depth?: number) => Array<{ path: string[]; value: SerializableValue }>
) {
  const cache = getCacheManager().pathExtractionCache;
  
  return function memoizedExtractPaths(
    obj: T, 
    parentPath: string[] = [], 
    depth: number = 0
  ): Array<{ path: string[]; value: SerializableValue }> {
    // Check cache first
    const cached = cache.get(obj as any, parentPath);
    if (cached !== undefined) {
      return cached;
    }
    
    // Compute result
    const result = extractPathsFunction(obj, parentPath, depth);
    
    // Cache the result
    cache.set(obj as any, parentPath, result);
    
    return result;
  };
}

/**
 * Create a memoized version of deepEqual function
 */
export function createMemoizedDeepEqual<T>(
  deepEqualFunction: (a: T, b: T) => boolean
) {
  const cache = getCacheManager().deepEqualityCache;
  
  return function memoizedDeepEqual(a: T, b: T): boolean {
    // Fast path for reference equality
    if (a === b) return true;
    
    // Check cache
    const cached = cache.get(a, b);
    if (cached !== undefined) {
      return cached;
    }
    
    // Compute result
    const result = deepEqualFunction(a, b);
    
    // Cache the result
    cache.set(a, b, result);
    
    return result;
  };
}

/**
 * Create a memoized version of storage key creation
 */
export function createMemoizedStorageKey(
  createKeyFunction: (path: string[]) => string
) {
  const cache = getCacheManager().storageKeyCache;
  
  return function memoizedCreateStorageKey(path: string[]): string {
    const pathKey = path.join(':');
    
    // Check cache first
    const cached = cache.get(pathKey);
    if (cached !== undefined) {
      return cached;
    }
    
    // Compute result
    const result = createKeyFunction(path);
    
    // Cache the result
    cache.set(pathKey, result);
    
    return result;
  };
}

/**
 * Create a memoized version of state reconstruction
 */
export function createMemoizedStateReconstruction<T>(
  reconstructFunction: (items: Map<string, unknown>) => T
) {
  const cache = getCacheManager().stateReconstructionCache;
  
  return function memoizedStateReconstruction(items: Map<string, unknown>): T {
    // Create a cache key from the items
    const entriesArray = Array.from(items.entries()).sort();
    const cacheKey = JSON.stringify(entriesArray);
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    
    // Compute result
    const result = reconstructFunction(items);
    
    // Cache the result
    cache.set(cacheKey, result);
    
    return result;
  };
}

// ============================================================================
// PATH-SPECIFIC MEMOIZATION
// ============================================================================

/**
 * Memoized path operations using the PathManager
 */
export class MemoizedPathOperations {
  private static buildSetUpdateCache = new Map<string, Record<string, unknown>>();
  private static buildDeleteUpdateCache = new Map<string, Record<string, unknown>>();
  private static pathNavigationCache = new Map<string, any>();
  
  /**
   * Memoized version of PathManager.buildSetUpdate
   */
  static buildSetUpdate(
    path: StatePath,
    value: unknown,
    currentState?: Record<string, unknown>
  ): Record<string, unknown> {
    const cacheKey = `${PathManager.toString(path)}:${JSON.stringify(value)}:${JSON.stringify(currentState)}`;
    
    if (MemoizedPathOperations.buildSetUpdateCache.has(cacheKey)) {
      return MemoizedPathOperations.buildSetUpdateCache.get(cacheKey)!;
    }
    
    const result = PathManager.buildSetUpdate(path, value, currentState);
    MemoizedPathOperations.buildSetUpdateCache.set(cacheKey, result);
    
    // Clean up cache if it gets too large
    if (MemoizedPathOperations.buildSetUpdateCache.size > 1000) {
      const keys = Array.from(MemoizedPathOperations.buildSetUpdateCache.keys());
      const keysToDelete = keys.slice(0, 500); // Remove oldest half
      keysToDelete.forEach(key => MemoizedPathOperations.buildSetUpdateCache.delete(key));
    }
    
    return result;
  }
  
  /**
   * Memoized version of PathManager.buildDeleteUpdate
   */
  static buildDeleteUpdate(
    path: StatePath,
    currentState: Record<string, unknown>,
    initialState?: Record<string, unknown>
  ): Record<string, unknown> {
    const cacheKey = `${PathManager.toString(path)}:${JSON.stringify(currentState)}:${JSON.stringify(initialState)}`;
    
    if (MemoizedPathOperations.buildDeleteUpdateCache.has(cacheKey)) {
      return MemoizedPathOperations.buildDeleteUpdateCache.get(cacheKey)!;
    }
    
    const result = PathManager.buildDeleteUpdate(path, currentState, initialState);
    MemoizedPathOperations.buildDeleteUpdateCache.set(cacheKey, result);
    
    // Clean up cache if it gets too large
    if (MemoizedPathOperations.buildDeleteUpdateCache.size > 1000) {
      const keys = Array.from(MemoizedPathOperations.buildDeleteUpdateCache.keys());
      const keysToDelete = keys.slice(0, 500); // Remove oldest half
      keysToDelete.forEach(key => MemoizedPathOperations.buildDeleteUpdateCache.delete(key));
    }
    
    return result;
  }
  
  /**
   * Memoized version of PathManager.navigate
   */
  static navigate<T = unknown>(
    obj: Record<string, unknown>,
    path: StatePath
  ): { found: boolean; value?: T; parent?: Record<string, unknown>; key?: string } {
    const cacheKey = `${JSON.stringify(obj)}:${PathManager.toString(path)}`;
    
    if (MemoizedPathOperations.pathNavigationCache.has(cacheKey)) {
      return MemoizedPathOperations.pathNavigationCache.get(cacheKey)!;
    }
    
    const result = PathManager.navigate<T>(obj, path);
    MemoizedPathOperations.pathNavigationCache.set(cacheKey, result);
    
    // Clean up cache if it gets too large
    if (MemoizedPathOperations.pathNavigationCache.size > 1000) {
      const keys = Array.from(MemoizedPathOperations.pathNavigationCache.keys());
      const keysToDelete = keys.slice(0, 500); // Remove oldest half
      keysToDelete.forEach(key => MemoizedPathOperations.pathNavigationCache.delete(key));
    }
    
    return result;
  }
  
  /**
   * Clear all memoization caches
   */
  static clearAllCaches(): void {
    MemoizedPathOperations.buildSetUpdateCache.clear();
    MemoizedPathOperations.buildDeleteUpdateCache.clear();
    MemoizedPathOperations.pathNavigationCache.clear();
  }
  
  /**
   * Get cache statistics
   */
  static getCacheStats() {
    return {
      buildSetUpdateCache: MemoizedPathOperations.buildSetUpdateCache.size,
      buildDeleteUpdateCache: MemoizedPathOperations.buildDeleteUpdateCache.size,
      pathNavigationCache: MemoizedPathOperations.pathNavigationCache.size
    };
  }
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

/**
 * Decorator that adds performance monitoring to memoized functions
 */
export function MemoizeWithPerformanceMonitoring(
  maxSize: number = 100,
  ttl: number = 5 * 60 * 1000,
  name?: string
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const methodName = name || `${target.constructor.name}.${propertyKey}`;
    
    // Simple performance tracking
    let callCount = 0;
    let totalExecutionTime = 0;
    
    descriptor.value = memoize(originalMethod, {
      maxSize,
      ttl,
      keyGenerator: (...args: any[]) => {
        callCount++;
        const startTime = performance.now();
        const key = JSON.stringify(args);
        const endTime = performance.now();
        
        totalExecutionTime += endTime - startTime;
        
        // Log performance metrics periodically
        if (callCount % 100 === 0) {
          console.debug(`Memoization stats for ${methodName}:`, {
            calls: callCount,
            avgKeyGenerationTime: totalExecutionTime / callCount
          });
        }
        
        return key;
      }
    });
    
    return descriptor;
  };
}

// ============================================================================
// CONDITIONAL MEMOIZATION
// ============================================================================

/**
 * Memoize only if the condition is met
 */
export function MemoizeIf(
  condition: (...args: any[]) => boolean,
  options: { maxSize?: number; ttl?: number } = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const memoizedMethod = memoize(originalMethod, options);
    
    descriptor.value = function (...args: any[]) {
      if (condition(...args)) {
        return memoizedMethod.apply(this, args);
      } else {
        return originalMethod.apply(this, args);
      }
    };
    
    return descriptor;
  };
}

/**
 * Memoize only for complex objects (skip primitives)
 */
export function MemoizeComplexOnly(options: { maxSize?: number; ttl?: number } = {}) {
  return MemoizeIf(
    (...args: any[]) => args.some(arg => typeof arg === 'object' && arg !== null),
    options
  );
}

/**
 * Memoize only for large objects (above certain size threshold)
 */
export function MemoizeLargeObjectsOnly(
  sizeThreshold: number = 1000,
  options: { maxSize?: number; ttl?: number } = {}
) {
  return MemoizeIf(
    (...args: any[]) => {
      return args.some(arg => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            return JSON.stringify(arg).length > sizeThreshold;
          } catch {
            return false;
          }
        }
        return false;
      });
    },
    options
  );
}

// ============================================================================
// CLEANUP UTILITIES
// ============================================================================

/**
 * Clean up all memoization caches
 */
export function clearAllMemoizationCaches(): void {
  MemoizedPathOperations.clearAllCaches();
  getCacheManager().clearAll();
}

/**
 * Get all memoization statistics
 */
export function getAllMemoizationStats() {
  return {
    pathOperations: MemoizedPathOperations.getCacheStats(),
    cacheManager: getCacheManager().getAllStats()
  };
} 