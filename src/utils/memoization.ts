import { SerializableValue } from '../types/multiplayer-types';
import { getCacheManager } from './cache-manager';

/**
 * Create a memoized version of extractPaths function
 */
export function createMemoizedExtractPaths<T>(
  extractPathsFunction: (
    obj: T,
    parentPath?: string[],
    depth?: number,
  ) => Array<{ path: string[]; value: SerializableValue }>,
) {
  const cache = getCacheManager().pathExtractionCache;

  return function memoizedExtractPaths(
    obj: T,
    parentPath: string[] = [],
    depth: number = 0,
  ): Array<{ path: string[]; value: SerializableValue }> {

    const cached = cache.get(obj as any, parentPath);
    if (cached !== undefined) {
      return cached;
    }


    const result = extractPathsFunction(obj, parentPath, depth);

    cache.set(obj as any, parentPath, result);

    return result;
  };
}

/**
 * Create a memoized version of deepEqual function
 */
export function createMemoizedDeepEqual<T>(deepEqualFunction: (a: T, b: T) => boolean) {
  const cache = getCacheManager().deepEqualityCache;

  return function memoizedDeepEqual(a: T, b: T): boolean {
    if (a === b) return true;

    const cached = cache.get(a, b);
    if (cached !== undefined) {
      return cached;
    }

    const result = deepEqualFunction(a, b);
    cache.set(a, b, result);

    return result;
  };
}

/**
 * Create a memoized version of storage key creation
 */
export function createMemoizedStorageKey(createKeyFunction: (path: string[]) => string) {
  const cache = getCacheManager().storageKeyCache;

  return function memoizedCreateStorageKey(path: string[]): string {
    const pathKey = path.join(':');

    const cached = cache.get(pathKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = createKeyFunction(path);

    cache.set(pathKey, result);

    return result;
  };
}

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








