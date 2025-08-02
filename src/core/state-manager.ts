import type { PropertyPath, SerializableValue, PathExtractable } from '../types/multiplayer-types';
import { getCacheManager } from '../utils/cache-manager';
import { isPlainObject, isPrimitive } from '../utils/index';

export interface StatePath {
  segments: string[];
  depth: number;
  isNested: boolean;
}

export interface PathNavigationResult<T = unknown> {
  found: boolean;
  value?: T;
  parent?: Record<string, unknown>;
  key?: string;
}

const EMPTY_PATH: StatePath = { segments: [], depth: 0, isNested: false };

export function createPath(segments: string[]): StatePath {
  return {
    segments: [...segments],
    depth: segments.length,
    isNested: segments.length > 1,
  };
}

export function pathFromArray(pathArray: string[]): StatePath {
  return createPath(pathArray);
}

function getParentPath(path: StatePath): StatePath {
  if (path.segments.length <= 1) return EMPTY_PATH;
  return createPath(path.segments.slice(0, -1));
}

export function shouldSkipMultiplayerPrefix(path: StatePath): boolean {
  return path.segments.length > 0 && path.segments[0] === 'multiplayer';
}

export function extractPaths<T extends PathExtractable>(
  obj: T,
  parentPath: string[] = [],
  depth: number = 0,
  maxDepth: number = 2,
): PropertyPath<SerializableValue>[] {
  const cacheManager = getCacheManager();
  const cached = cacheManager.pathExtractionCache.get(obj as object, parentPath);

  if (cached !== undefined) {
    return cached;
  }

  const paths: PropertyPath<SerializableValue>[] = [];
  const entries = Object.entries(obj);

  for (const [key, value] of entries) {
    const currentPath = [...parentPath, key];

    if (maxDepth === 0) {
      paths.push({ path: currentPath, value });
    } else if (isPrimitive(value) || Array.isArray(value)) {
      paths.push({ path: currentPath, value });
    } else if (isPlainObject(value)) {
      if (depth >= maxDepth) {
        paths.push({ path: currentPath, value });
      } else {
        const nestedPaths = extractPaths(
          value as PathExtractable,
          currentPath,
          depth + 1,
          maxDepth,
        );
        paths.push(...nestedPaths);
      }
    } else {
      paths.push({ path: currentPath, value });
    }
  }

  cacheManager.pathExtractionCache.set(obj as object, parentPath, paths);
  return paths;
}

export function detectActualChanges<T extends PathExtractable>(
  oldState: T,
  newState: T,
  parentPath: string[] = [],
  maxDepth: number = 2,
): PropertyPath<SerializableValue>[] {
  if (oldState === newState) return [];
  if (!oldState && !newState) return [];
  if (!oldState && newState) return extractPaths(newState, parentPath, 0, maxDepth);
  if (oldState && !newState) {
    const oldPaths = extractPaths(oldState, parentPath, 0, maxDepth);
    return oldPaths.map(({ path }) => ({ path, value: undefined }));
  }

  if (maxDepth === 0) {
    return detectTopLevelChanges(oldState, newState, parentPath);
  }

  return detectDeepChanges(oldState, newState, parentPath, maxDepth);
}

function detectTopLevelChanges<T extends PathExtractable>(
  oldState: T,
  newState: T,
  parentPath: string[],
): PropertyPath<SerializableValue>[] {
  const changes: PropertyPath<SerializableValue>[] = [];

  for (const [key, value] of Object.entries(newState)) {
    const oldValue = oldState[key as keyof T];
    if (!deepEqual(oldValue as unknown, value as unknown)) {
      if (isPlainObject(oldValue) && isPlainObject(value)) {
        const diff = computeObjectDiff(
          oldValue as Record<string, unknown>,
          value as Record<string, unknown>,
        );
        if (Object.keys(diff).length > 0) {
          changes.push({ path: [...parentPath, key], value: diff as SerializableValue });
        }
      } else {
        changes.push({ path: [...parentPath, key], value });
      }
    }
  }

  for (const key of Object.keys(oldState)) {
    if (!(key in newState)) {
      changes.push({ path: [...parentPath, key], value: undefined });
    }
  }

  return changes;
}

/**
 * Creates path maps from extracted paths for efficient lookup
 */
function createPathMaps(
  oldPaths: PropertyPath<SerializableValue>[],
  newPaths: PropertyPath<SerializableValue>[],
): { oldPathMap: Map<string, SerializableValue>; newPathMap: Map<string, SerializableValue> } {
  const oldPathMap = new Map<string, SerializableValue>();
  const newPathMap = new Map<string, SerializableValue>();

  oldPaths.forEach(({ path, value }) => oldPathMap.set(path.join('.'), value));
  newPaths.forEach(({ path, value }) => newPathMap.set(path.join('.'), value));

  return { oldPathMap, newPathMap };
}

/**
 * Detects changes in new/modified paths
 */
function detectModifiedPaths(
  newPaths: PropertyPath<SerializableValue>[],
  oldPathMap: Map<string, SerializableValue>,
  parentPath: string[],
  maxDepth: number,
): PropertyPath<SerializableValue>[] {
  const changes: PropertyPath<SerializableValue>[] = [];

  for (const { path, value } of newPaths) {
    const pathKey = path.join('.');
    const oldValue = oldPathMap.get(pathKey);

    if (oldValue === undefined || !deepEqual(oldValue, value)) {
      const depth = path.length - parentPath.length - 1;
      // Skip intermediate objects that will be processed at a deeper level
      if (isPlainObject(value) && !Array.isArray(value) && depth < maxDepth) {
        continue;
      }
      changes.push({ path, value });
    }
  }

  return changes;
}

/**
 * Detects deleted paths
 */
function detectDeletedPaths(
  oldPaths: PropertyPath<SerializableValue>[],
  newPathMap: Map<string, SerializableValue>,
): PropertyPath<SerializableValue>[] {
  const deletions: PropertyPath<SerializableValue>[] = [];

  for (const { path } of oldPaths) {
    const pathKey = path.join('.');
    if (!newPathMap.has(pathKey)) {
      deletions.push({ path, value: undefined });
    }
  }

  return deletions;
}

function detectDeepChanges<T extends PathExtractable>(
  oldState: T,
  newState: T,
  parentPath: string[],
  maxDepth: number,
): PropertyPath<SerializableValue>[] {
  const oldPaths = extractPaths(oldState, parentPath, 0, maxDepth);
  const newPaths = extractPaths(newState, parentPath, 0, maxDepth);

  const { oldPathMap, newPathMap } = createPathMaps(oldPaths, newPaths);

  const modifiedChanges = detectModifiedPaths(newPaths, oldPathMap, parentPath, maxDepth);
  const deletedChanges = detectDeletedPaths(oldPaths, newPathMap);

  return [...modifiedChanges, ...deletedChanges];
}

export function navigate<T = unknown>(
  obj: Record<string, unknown>,
  path: StatePath,
): PathNavigationResult<T> {
  if (path.segments.length === 0) {
    return { found: true, value: obj as T };
  }

  let current = obj;

  for (let i = 0; i < path.segments.length; i++) {
    const segment = path.segments[i];

    if (current === null || typeof current !== 'object') {
      return { found: false };
    }

    if (i === path.segments.length - 1) {
      return {
        found: segment in current,
        value: current[segment] as T,
        parent: current,
        key: segment,
      };
    }

    current = current[segment] as Record<string, unknown>;
  }

  return { found: false };
}

export function setValue(obj: Record<string, unknown>, path: StatePath, value: unknown): void {
  if (path.segments.length === 0) return;

  let current = obj;

  for (let i = 0; i < path.segments.length - 1; i++) {
    const segment = path.segments[i];

    if (!current[segment] || !isPlainObject(current[segment])) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = path.segments[path.segments.length - 1];
  current[lastSegment] = value;
}

export function hasPath(obj: Record<string, unknown>, path: StatePath): boolean {
  return navigate(obj, path).found;
}

export function buildSetUpdate(
  path: StatePath,
  value: unknown,
  currentState?: Record<string, unknown>,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  let current = update;
  let currentStateTraversal = currentState;

  for (let i = 0; i < path.segments.length - 1; i++) {
    const segment = path.segments[i];

    if (shouldCloneExistingObject(currentStateTraversal, segment)) {
      current[segment] = { ...(currentStateTraversal![segment] as Record<string, unknown>) };
    } else {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
    currentStateTraversal = currentStateTraversal?.[segment] as Record<string, unknown>;
  }

  const lastSegment = path.segments[path.segments.length - 1];
  current[lastSegment] = value;

  return update;
}

function computeObjectDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};

  for (const [key, newValue] of Object.entries(newObj)) {
    const oldValue = oldObj[key];

    if (!deepEqual(oldValue, newValue)) {
      if (isPlainObject(oldValue) && isPlainObject(newValue)) {
        const nestedDiff = computeObjectDiff(oldValue, newValue);
        if (Object.keys(nestedDiff).length > 0) {
          diff[key] = nestedDiff;
        }
      } else {
        diff[key] = newValue;
      }
    }
  }

  for (const key of Object.keys(oldObj)) {
    if (!(key in newObj)) {
      diff[key] = undefined;
    }
  }

  return diff;
}

export function buildDeleteUpdate(
  path: StatePath,
  currentState: Record<string, unknown>,
  initialState?: Record<string, unknown>,
  maxDepth: number = 2,
): Record<string, unknown> {
  if (!hasPath(currentState, path)) return {};

  const update: Record<string, unknown> = {};
  let current = update;
  let currentStateTraversal = currentState;

  for (let i = 0; i < path.segments.length - 1; i++) {
    const segment = path.segments[i];

    if (shouldCloneExistingObject(currentStateTraversal, segment)) {
      current[segment] = { ...(currentStateTraversal[segment] as Record<string, unknown>) };
    } else {
      return {};
    }

    current = current[segment] as Record<string, unknown>;
    currentStateTraversal = currentStateTraversal?.[segment] as Record<string, unknown>;
  }

  processDeletion(path, current, update, initialState, currentState, maxDepth);
  return update;
}

export function deepEqual<T = SerializableValue>(a: T, b: T): boolean {
  if (a === b) return true;

  const cacheManager = getCacheManager();
  const cached = cacheManager.deepEqualityCache.get(a, b);

  if (cached !== undefined) return cached;

  if (a === null || b === null) {
    const result = a === b;
    cacheManager.deepEqualityCache.set(a, b, result);
    return result;
  }

  if (typeof a !== typeof b || typeof a !== 'object') {
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

export function cleanupEmptyObjects(
  obj: Record<string, unknown>,
  isTopLevel: boolean = true,
): Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj as Record<string, unknown>;
  }

  const cleaned: Record<string, unknown> = {};
  let hasNonEmptyValues = false;

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const cleanedValue = cleanupEmptyObjects(value as Record<string, unknown>, false);

      if (isTopLevel || (cleanedValue && Object.keys(cleanedValue).length > 0)) {
        cleaned[key] = cleanedValue;
        if (!isTopLevel && Object.keys(cleanedValue).length > 0) {
          hasNonEmptyValues = true;
        } else if (isTopLevel) {
          hasNonEmptyValues = true;
        }
      }
    } else {
      cleaned[key] = value;
      hasNonEmptyValues = true;
    }
  }

  return isTopLevel || hasNonEmptyValues ? cleaned : {};
}

function processDeletion(
  path: StatePath,
  current: Record<string, unknown>,
  stateUpdate: Record<string, unknown>,
  initialState?: Record<string, unknown>,
  currentState?: Record<string, unknown>,
  maxDepth: number = 2,
): void {
  const lastSegment = path.segments[path.segments.length - 1];

  if (path.depth === 1) {
    handleTopLevelDeletion(path, stateUpdate, initialState);
  } else if (path.depth > maxDepth + 1) {
    handleNestedDeletion(path, current, stateUpdate, currentState, maxDepth);
  } else {
    delete current[lastSegment];
  }
}

function handleNestedDeletion(
  path: StatePath,
  current: Record<string, unknown>,
  stateUpdate: Record<string, unknown>,
  currentState?: Record<string, unknown>,
  maxDepth: number = 2,
): void {
  const lastSegment = path.segments[path.segments.length - 1];
  delete current[lastSegment];

  if (path.depth >= maxDepth && currentState) {
    const parentPath = getParentPath(path);
    const parentResult = navigate(currentState, parentPath);

    if (parentResult.found && parentResult.value && isPlainObject(parentResult.value)) {
      const parentObject = parentResult.value;
      const remainingKeys = Object.keys(parentObject).filter(key => key !== lastSegment);

      if (remainingKeys.length === 0) {
        const grandparentPath = getParentPath(parentPath);

        if (grandparentPath.segments.length === 0) {
          const parentKey = parentPath.segments[parentPath.segments.length - 1];
          delete stateUpdate[parentKey];
        } else {
          const grandparentResult = navigate(stateUpdate, grandparentPath);

          if (grandparentResult.found && grandparentResult.parent && grandparentResult.key) {
            const parentKey = parentPath.segments[parentPath.segments.length - 1];
            delete grandparentResult.parent[parentKey];
          } else if (
            grandparentResult.found &&
            grandparentResult.value &&
            isPlainObject(grandparentResult.value)
          ) {
            const parentKey = parentPath.segments[parentPath.segments.length - 1];
            const grandparentObj = grandparentResult.value;
            delete grandparentObj[parentKey];
          }
        }
      }
    }
  }
}

function handleTopLevelDeletion(
  path: StatePath,
  stateUpdate: Record<string, unknown>,
  initialState?: Record<string, unknown>,
): void {
  const key = path.segments[0];

  if (initialState && key in initialState) {
    stateUpdate[key] = initialState[key];
  } else {
    delete stateUpdate[key];
  }
}

function shouldCloneExistingObject(
  currentState: Record<string, unknown> | undefined,
  segment: string,
): boolean {
  return (
    currentState !== null &&
    currentState !== undefined &&
    typeof currentState[segment] === 'object' &&
    !Array.isArray(currentState[segment])
  );
}

export function detectStateChanges<TState>(oldState: TState, newState: TState): Partial<TState> {
  const changes: Partial<TState> = {};

  for (const key in newState) {
    if (newState[key] !== oldState[key]) {
      changes[key] = newState[key];
    }
  }

  return changes;
}

export function detectStateDeletions<TState extends PathExtractable>(
  oldState: TState,
  newState: TState,
  maxDepth: number = 2,
): Array<{ path: string[] }> {
  const deletions: Array<{ path: string[] }> = [];

  for (const [field, newValue] of Object.entries(newState)) {
    if (field === 'multiplayer' || typeof newValue === 'function') {
      continue;
    }

    if (isPlainObject(newValue)) {
      const oldFieldValue = (oldState as Record<string, unknown>)[field];

      if (isPlainObject(oldFieldValue)) {
        const fieldDeletions = findDeletedPathsInField(oldFieldValue, newValue, field, maxDepth);
        deletions.push(...fieldDeletions);
      }
    }
  }

  return deletions;
}

function findDeletedPathsInField(
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  fieldName: string,
  maxDepth: number = 2,
): Array<{ path: string[] }> {
  const oldPaths = extractPaths({ [fieldName]: oldValue } as PathExtractable, [], 0, maxDepth);
  const newPaths = extractPaths({ [fieldName]: newValue } as PathExtractable, [], 0, maxDepth);

  const oldPathSet = new Set(oldPaths.map(p => p.path.join('.')));
  const newPathSet = new Set(newPaths.map(p => p.path.join('.')));

  const deletedPaths = Array.from(oldPathSet).filter(path => {
    if (newPathSet.has(path)) {
      return false;
    }

    const pathPrefix = `${path}.`;
    return !Array.from(newPathSet).some(newPath => newPath.startsWith(pathPrefix));
  });

  return deletedPaths.map(deletedPath => ({
    path: deletedPath.split('.'),
  }));
}
