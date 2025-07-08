// ============================================================================
// State Utility Functions - Enhanced with Caching and Path Management
// ============================================================================

import type { PropertyPath, SerializableValue, PathExtractable } from '../types/multiplayer-types';
import { getCacheManager } from './cache-manager';
import { MAX_DEPTH } from './constants';
import {
  createMemoizedExtractPaths,
  createMemoizedDeepEqual,
} from './memoization';
import { PathManager, fromLegacyPath } from './path-manager';
import { isPlainObject } from './index';

// ============================================================================
// TYPE GUARDS
// ============================================================================

// isPlainObject is now imported from ../utils/index.ts

/**
 * Type guard to check if a value is a primitive
 */
export function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Type guard to check if a value should be stored granularly
 */
export function shouldStoreGranularly(value: unknown): value is Record<string, SerializableValue> {
  return isPlainObject(value);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a value appears to be a Record type (dynamic keys with similar structure)
 * Optimized to avoid multiple object key iterations
 */
export function isRecordType(
  value: unknown,
): value is Record<string, Record<string, SerializableValue>> {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }

  // If all keys are non-standard property names and values have similar structure
  const firstValue = value[keys[0]];
  if (!isPlainObject(firstValue)) {
    return false;
  }

  // Optimize: get first keys once and reuse
  const firstKeys = Object.keys(firstValue).sort();
  if (firstKeys.length === 0) {
    return false;
  }

  // Check if all values have similar structure (same keys)
  return keys.every(key => {
    const val = value[key];
    if (!isPlainObject(val)) {
      return false;
    }

    const valKeys = Object.keys(val);
    return valKeys.length === firstKeys.length && valKeys.every(k => firstKeys.includes(k));
  });
}

// ============================================================================
// ENHANCED PATH EXTRACTION WITH CACHING
// ============================================================================

/**
 * Extract all paths to leaf values in an object
 * Enhanced with caching and centralized path management
 */
export function extractPaths<T extends PathExtractable>(
  obj: T,
  parentPath: string[] = [],
  depth: number = 0,
): PropertyPath<SerializableValue>[] {
  // Use cached version for performance
  const cacheManager = getCacheManager();
  const cached = cacheManager.pathExtractionCache.get(obj as any, parentPath);

  if (cached !== undefined) {
    return cached;
  }

  // Prevent infinite recursion
  if (depth > MAX_DEPTH) {
    console.warn(`Maximum depth of ${MAX_DEPTH} exceeded in extractPaths`);
    return [];
  }

  const paths: PropertyPath<SerializableValue>[] = [];
  const entries = Object.entries(obj);

  for (const [key, value] of entries) {
    const currentPath = [...parentPath, key];

    if (isPrimitive(value) || Array.isArray(value)) {
      // Primitive value or array - store as leaf
      paths.push({ path: currentPath, value });
    } else if (isPlainObject(value)) {
      const objectKeys = Object.keys(value);

      if (objectKeys.length === 0 && currentPath.length === 1) {
        // Empty object at depth 1 - store as leaf
        paths.push({ path: currentPath, value });
      } else if (currentPath.length >= 2 && isRecordType(value)) {
        // Record entries at depth 2+ should be atomic
        paths.push({ path: currentPath, value });
      } else if (currentPath.length >= 3) {
        // Non-Record objects at depth 3+ - store as leaf to prevent over-granularization
        paths.push({ path: currentPath, value });
      } else {
        // Recurse deeper for regular nested objects
        const nestedPaths = extractPaths(value as PathExtractable, currentPath, depth + 1);
        paths.push(...nestedPaths);
      }
    } else {
      // Fallback for other types - store as leaf
      paths.push({ path: currentPath, value });
    }
  }

  // Cache the result
  cacheManager.pathExtractionCache.set(obj as any, parentPath, paths);

  return paths;
}

/**
 * Optimized deep equality check with caching
 */
export function deepEqual<T = SerializableValue>(a: T, b: T): boolean {
  // Fast path for reference equality
  if (a === b) return true;

  // Check cache first
  const cacheManager = getCacheManager();
  const cached = cacheManager.deepEqualityCache.get(a, b);

  if (cached !== undefined) {
    return cached;
  }

  // Handle null/undefined cases
  if (a == null || b == null) {
    const result = a === b;
    cacheManager.deepEqualityCache.set(a, b, result);
    return result;
  }

  // Type check - different types are not equal
  if (typeof a !== typeof b) {
    cacheManager.deepEqualityCache.set(a, b, false);
    return false;
  }

  // Primitive types - already checked above
  if (typeof a !== 'object') {
    cacheManager.deepEqualityCache.set(a, b, false);
    return false;
  }

  // Array comparison
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

  // Object comparison - optimize key iteration
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;

  const keysA = Object.keys(aRecord);
  const keysB = Object.keys(bRecord);

  if (keysA.length !== keysB.length) {
    cacheManager.deepEqualityCache.set(a, b, false);
    return false;
  }

  // Use for...of for better performance
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
 * Enhanced with centralized path management
 */
export function detectActualChanges<T extends PathExtractable>(
  oldState: T,
  newState: T,
  parentPath: string[] = [],
): PropertyPath<SerializableValue>[] {
  const changes: PropertyPath<SerializableValue>[] = [];

  // Early return if states are identical
  if (oldState === newState) {
    return changes;
  }

  // Handle null/undefined cases
  if (!oldState && !newState) {
    return changes;
  }

  if (!oldState && newState) {
    // Completely new state
    return extractPaths(newState, parentPath);
  }

  if (oldState && !newState) {
    // State was deleted - return all old paths as deletions
    const oldPaths = extractPaths(oldState, parentPath);
    return oldPaths.map(({ path }) => ({ path, value: undefined }));
  }

  // Extract paths from both states
  const oldPaths = extractPaths(oldState, parentPath);
  const newPaths = extractPaths(newState, parentPath);

  // Create maps for faster lookup
  const oldPathMap = new Map<string, SerializableValue>();
  const newPathMap = new Map<string, SerializableValue>();

  oldPaths.forEach(({ path, value }) => {
    oldPathMap.set(path.join('.'), value);
  });

  newPaths.forEach(({ path, value }) => {
    newPathMap.set(path.join('.'), value);
  });

  // Check for new and changed values
  for (const { path, value } of newPaths) {
    const pathKey = path.join('.');
    const oldValue = oldPathMap.get(pathKey);

    if (oldValue === undefined || !deepEqual(oldValue, value)) {
      changes.push({ path, value });
    }
  }

  // Check for deleted values
  for (const { path } of oldPaths) {
    const pathKey = path.join('.');
    if (!newPathMap.has(pathKey)) {
      changes.push({ path, value: undefined });
    }
  }

  return changes;
}

/**
 * Get value at a specific path in an object
 * Enhanced with PathManager integration
 */
function getValueAtPath(obj: unknown, path: string[]): unknown {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }

  const statePath = fromLegacyPath(path);
  return PathManager.getValue(obj as Record<string, unknown>, statePath);
}

/**
 * Safe path extraction with error handling
 */
export function safeExtractPaths<T extends PathExtractable>(
  obj: T,
  parentPath: string[] = [],
): PropertyPath<SerializableValue>[] {
  try {
    return extractPaths(obj, parentPath);
  } catch (error) {
    // Use console.warn instead of console.error for non-critical path extraction issues
    console.warn('Path extraction failed, returning empty array:', error);
    return [];
  }
}

/**
 * Compare two objects and return only the changed paths
 * Enhanced with PathManager integration
 */
export function getChangedPaths<T extends PathExtractable>(
  oldObj: T,
  newObj: T,
  parentPath: string[] = [],
): PropertyPath<SerializableValue>[] {
  const changes: PropertyPath<SerializableValue>[] = [];

  // Handle edge cases
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
 * Batch process multiple paths with optimized caching
 */
export function batchProcessPaths<T extends PathExtractable>(
  operations: Array<{ obj: T; parentPath?: string[] }>,
): PropertyPath<SerializableValue>[] {
  const allPaths: PropertyPath<SerializableValue>[] = [];

  for (const { obj, parentPath = [] } of operations) {
    const paths = safeExtractPaths(obj, parentPath);
    allPaths.push(...paths);
  }

  return allPaths;
}

// ============================================================================
// ENHANCED UTILITY FUNCTIONS WITH PATH MANAGER
// ============================================================================

/**
 * Set value at path using PathManager
 */
export function setValueAtPath(obj: Record<string, unknown>, path: string[], value: unknown): void {
  const statePath = fromLegacyPath(path);
  PathManager.setValue(obj, statePath, value);
}

/**
 * Delete value at path using PathManager
 */
export function deleteValueAtPath(obj: Record<string, unknown>, path: string[]): boolean {
  const statePath = fromLegacyPath(path);
  return PathManager.deleteValue(obj, statePath);
}

/**
 * Check if path exists using PathManager
 */
export function hasPath(obj: Record<string, unknown>, path: string[]): boolean {
  const statePath = fromLegacyPath(path);
  return PathManager.hasPath(obj, statePath);
}

/**
 * Build state update object using PathManager
 */
export function buildStateUpdate(
  path: string[],
  value: unknown,
  currentState?: Record<string, unknown>,
): Record<string, unknown> {
  const statePath = fromLegacyPath(path);
  return PathManager.buildSetUpdate(statePath, value, currentState);
}

/**
 * Build state deletion object using PathManager
 */
export function buildStateDeletion(
  path: string[],
  currentState: Record<string, unknown>,
  initialState?: Record<string, unknown>,
): Record<string, unknown> {
  const statePath = fromLegacyPath(path);
  return PathManager.buildDeleteUpdate(statePath, currentState, initialState);
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all caches used by state utilities
 */
export function clearStateUtilsCaches(): void {
  getCacheManager().clearAll();
}

/**
 * Get cache statistics for state utilities
 */
export function getStateUtilsCacheStats() {
  return getCacheManager().getAllStats();
}

// ============================================================================
// MEMOIZED VERSIONS FOR PERFORMANCE-CRITICAL OPERATIONS
// ============================================================================

/**
 * Create memoized version of extractPaths for repeated use
 */
export const memoizedExtractPaths = createMemoizedExtractPaths(extractPaths);

/**
 * Create memoized version of deepEqual for repeated use
 */
export const memoizedDeepEqual = createMemoizedDeepEqual(deepEqual);

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * Legacy extractPaths function for backward compatibility
 * @deprecated Use extractPaths directly - caching is now built-in
 */
export function extractPathsLegacy<T extends PathExtractable>(
  obj: T,
  parentPath: string[] = [],
  depth: number = 0,
): PropertyPath<SerializableValue>[] {
  return extractPaths(obj, parentPath, depth);
}

/**
 * Legacy deepEqual function for backward compatibility
 * @deprecated Use deepEqual directly - caching is now built-in
 */
export function deepEqualLegacy<T = SerializableValue>(a: T, b: T): boolean {
  return deepEqual(a, b);
}
