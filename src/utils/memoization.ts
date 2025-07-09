import { getCacheManager } from './cache-manager';

/**
 * Create a memoized version of state reconstruction
 */
export function createMemoizedStateReconstruction<T>(
  reconstructFunction: (items: Map<string, unknown>) => T,
) {
  const cache = getCacheManager().stateReconstructionCache;

  return function memoizedStateReconstruction(items: Map<string, unknown>): T {
    const entriesArray = Array.from(items.entries()).sort();
    const cacheKey = JSON.stringify(entriesArray);

    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = reconstructFunction(items);

    cache.set(cacheKey, result);

    return result;
  };
}
