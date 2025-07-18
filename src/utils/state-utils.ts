// ============================================================================
// State Utility Functions
// ============================================================================

import type { PropertyPath, SerializableValue, PathExtractable } from '../types/multiplayer-types';
import { getCacheManager } from './cache-manager';
import { MAX_DEPTH } from './constants';
import { isPlainObject, isPrimitive } from './index';

/**
 * Extract all paths to leaf values in an object
 */
export function extractPaths<T extends PathExtractable>(
  obj: T,
  parentPath: string[] = [],
  depth: number = 0,
): PropertyPath<SerializableValue>[] {
  const cacheManager = getCacheManager();
  const cached = cacheManager.pathExtractionCache.get(obj as any, parentPath);

  if (cached !== undefined) {
    return cached;
  }

  const paths: PropertyPath<SerializableValue>[] = [];
  const entries = Object.entries(obj);

  for (const [key, value] of entries) {
    const currentPath = [...parentPath, key];

    if (isPrimitive(value) || Array.isArray(value)) {
      paths.push({ path: currentPath, value });
    } else if (isPlainObject(value)) {
      if (depth >= MAX_DEPTH) {
        paths.push({ path: currentPath, value });
      } else {
        const nestedPaths = extractPaths(value as PathExtractable, currentPath, depth + 1);

        paths.push(...nestedPaths);
      }
    } else {
      paths.push({ path: currentPath, value });
    }
  }

  cacheManager.pathExtractionCache.set(obj as any, parentPath, paths);

  return paths;
}

/**
 *  deep equality check
 */
export function deepEqual<T = SerializableValue>(a: T, b: T): boolean {
  if (a === b) return true;

  const cacheManager = getCacheManager();
  const cached = cacheManager.deepEqualityCache.get(a, b);

  if (cached !== undefined) {
    return cached;
  }

  if (a === null || b === null) {
    const result = a === b;
    cacheManager.deepEqualityCache.set(a, b, result);
    return result;
  }

  if (typeof a !== typeof b) {
    cacheManager.deepEqualityCache.set(a, b, false);
    return false;
  }

  if (typeof a !== 'object') {
    cacheManager.deepEqualityCache.set(a, b, false);
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    cacheManager.deepEqualityCache.set(a, b, false);
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      cacheManager.deepEqualityCache.set(a, b, false);
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        cacheManager.deepEqualityCache.set(a, b, false);
        return false;
      }
    }

    cacheManager.deepEqualityCache.set(a, b, true);
    return true;
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;

  const keysA = Object.keys(aRecord);
  const keysB = Object.keys(bRecord);

  if (keysA.length !== keysB.length) {
    cacheManager.deepEqualityCache.set(a, b, false);
    return false;
  }

  for (const key of keysA) {
    if (!(key in bRecord) || !deepEqual(aRecord[key], bRecord[key])) {
      cacheManager.deepEqualityCache.set(a, b, false);
      return false;
    }
  }

  cacheManager.deepEqualityCache.set(a, b, true);
  return true;
}

/**
 * Detect actual changes between two states by comparing values
 */
export function detectActualChanges<T extends PathExtractable>(
  oldState: T,
  newState: T,
  parentPath: string[] = [],
): PropertyPath<SerializableValue>[] {
  const changes: PropertyPath<SerializableValue>[] = [];

  if (oldState === newState) {
    return changes;
  }

  if (!oldState && !newState) {
    return changes;
  }

  if (!oldState && newState) {
    return extractPaths(newState, parentPath);
  }

  if (oldState && !newState) {
    const oldPaths = extractPaths(oldState, parentPath);
    return oldPaths.map(({ path }) => ({ path, value: undefined }));
  }

  const oldPaths = extractPaths(oldState, parentPath);
  const newPaths = extractPaths(newState, parentPath);

  const oldPathMap = new Map<string, SerializableValue>();
  const newPathMap = new Map<string, SerializableValue>();

  oldPaths.forEach(({ path, value }) => {
    oldPathMap.set(path.join('.'), value);
  });

  newPaths.forEach(({ path, value }) => {
    newPathMap.set(path.join('.'), value);
  });

  for (const { path, value } of newPaths) {
    const pathKey = path.join('.');
    const oldValue = oldPathMap.get(pathKey);

    if (oldValue === undefined || !deepEqual(oldValue, value)) {
      changes.push({ path, value });
    }
  }

  for (const { path } of oldPaths) {
    const pathKey = path.join('.');
    if (!newPathMap.has(pathKey)) {
      changes.push({ path, value: undefined });
    }
  }

  return changes;
}

/**
 * Compare two objects and return only the changed paths
 */
export function getChangedPaths<T extends PathExtractable>(
  oldObj: T,
  newObj: T,
  parentPath: string[] = [],
): PropertyPath<SerializableValue>[] {
  const changes: PropertyPath<SerializableValue>[] = [];

  if (oldObj === newObj) return changes;
  if (!isPlainObject(oldObj) || !isPlainObject(newObj)) {
    return [{ path: parentPath, value: newObj as SerializableValue }];
  }

  const oldKeys = new Set(Object.keys(oldObj));
  const newKeys = new Set(Object.keys(newObj));
  const allKeys = new Set([...oldKeys, ...newKeys]);

  for (const key of allKeys) {
    const currentPath = [...parentPath, key];
    const oldValue = oldObj[key];
    const newValue = newObj[key];

    if (!oldKeys.has(key)) {
      // New key
      changes.push({ path: currentPath, value: newValue });
    } else if (!newKeys.has(key)) {
      // Deleted key
      changes.push({ path: currentPath, value: undefined });
    } else if (!deepEqual(oldValue, newValue)) {
      // Changed value
      if (isPlainObject(oldValue) && isPlainObject(newValue)) {
        // Recurse for nested objects
        const nestedChanges = getChangedPaths(oldValue, newValue, currentPath);
        changes.push(...nestedChanges);
      } else {
        // Direct value change
        changes.push({ path: currentPath, value: newValue });
      }
    }
  }

  return changes;
}

/**
 * Detect deletions between old and new state
 */
export function detectStateDeletions<TState extends PathExtractable>(
  oldState: TState,
  newState: TState,
): Array<{ path: string[] }> {
  const deletions: Array<{ path: string[] }> = [];

  for (const [field, newValue] of Object.entries(newState)) {
    if (field === 'multiplayer' || typeof newValue === 'function') {
      continue;
    }

    if (isPlainObject(newValue)) {
      const oldFieldValue = (oldState as Record<string, unknown>)[field];

      if (isPlainObject(oldFieldValue)) {
        const fieldDeletions = findDeletedPathsInField(oldFieldValue, newValue, field);
        deletions.push(...fieldDeletions);
      }
    }
  }

  return deletions;
}

/**
 * Find paths that have been deleted within a specific field
 */
function findDeletedPathsInField(
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  fieldName: string,
): Array<{ path: string[] }> {
  const oldPaths = extractPaths({ [fieldName]: oldValue } as PathExtractable);
  const newPaths = extractPaths({ [fieldName]: newValue } as PathExtractable);

  const oldPathSet = new Set(oldPaths.map(p => p.path.join('.')));
  const newPathSet = new Set(newPaths.map(p => p.path.join('.')));

  const deletedPaths = Array.from(oldPathSet).filter(path => {
    if (newPathSet.has(path)) {
      return false;
    }

    const pathPrefix = path + '.';
    return !Array.from(newPathSet).some(newPath => newPath.startsWith(pathPrefix));
  });

  return deletedPaths.map(deletedPath => ({
    path: deletedPath.split('.'),
  }));
}

/**
 * Detect changes between old and new state
 */
export function detectStateChanges<TState>(oldState: TState, newState: TState): Partial<TState> {
  const changes: Partial<TState> = {};

  for (const key in newState) {
    if (newState[key] !== oldState[key]) {
      changes[key] = newState[key];
    }
  }

  return changes;
}
