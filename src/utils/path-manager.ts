import {
  PATH_SEPARATOR,
  DISPLAY_PATH_SEPARATOR,
  MULTIPLAYER_FIELD as MULTIPLAYER_STATE_KEY,
  MAX_DEPTH,
} from './constants';
import { isPlainObject } from './index';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Represents a path in the state tree
 */
export interface StatePath {
  segments: string[];
  depth: number;
  isNested: boolean;
}

/**
 * Path navigation result
 */
export interface PathNavigationResult<T = unknown> {
  found: boolean;
  value?: T;
  parent?: Record<string, unknown>;
  key?: string;
}

/**
 * Path building configuration
 */
export interface PathBuildConfig {
  skipMultiplayerPrefix?: boolean;
  useDisplaySeparator?: boolean;
}

// ============================================================================
// CORE PATH UTILITIES
// ============================================================================

/**
 * Centralized path management utility
 * Consolidates all path operations from different files
 */
export class PathManager {
  private static readonly EMPTY_PATH: StatePath = { segments: [], depth: 0, isNested: false };

  /**
   * Create a StatePath from string segments
   */
  static createPath(segments: string[]): StatePath {
    return {
      segments: [...segments],
      depth: segments.length,
      isNested: segments.length > 1,
    };
  }

  /**
   * Create a StatePath from a string with separator
   */
  static fromString(pathString: string, separator: string = PATH_SEPARATOR): StatePath {
    if (!pathString) return PathManager.EMPTY_PATH;

    const segments = pathString.split(separator).filter(Boolean);
    return PathManager.createPath(segments);
  }

  /**
   * Convert StatePath to string
   */
  static toString(path: StatePath, config?: PathBuildConfig): string {
    if (path.segments.length === 0) return '';

    const separator = config?.useDisplaySeparator ? DISPLAY_PATH_SEPARATOR : PATH_SEPARATOR;
    return path.segments.join(separator);
  }

  /**
   * Join path segments into a single path
   */
  static join(...segments: (string | StatePath)[]): StatePath {
    const allSegments: string[] = [];

    for (const segment of segments) {
      if (typeof segment === 'string') {
        allSegments.push(segment);
      } else {
        allSegments.push(...segment.segments);
      }
    }

    return PathManager.createPath(allSegments);
  }

  /**
   * Get parent path (all segments except the last)
   */
  static getParent(path: StatePath): StatePath {
    if (path.segments.length <= 1) return PathManager.EMPTY_PATH;

    return PathManager.createPath(path.segments.slice(0, -1));
  }

  /**
   * Get the last segment of a path
   */
  static getLastSegment(path: StatePath): string | undefined {
    return path.segments[path.segments.length - 1];
  }

  /**
   * Get the first segment of a path
   */
  static getFirstSegment(path: StatePath): string | undefined {
    return path.segments[0];
  }

  /**
   * Check if path starts with given prefix
   */
  static startsWith(path: StatePath, prefix: StatePath): boolean {
    if (prefix.segments.length > path.segments.length) return false;

    return prefix.segments.every((segment, index) => path.segments[index] === segment);
  }

  /**
   * Check if path is a subpath of another path
   */
  static isSubPath(child: StatePath, parent: StatePath): boolean {
    return PathManager.startsWith(child, parent) && child.segments.length > parent.segments.length;
  }

  /**
   * Check if path equals another path
   */
  static equals(path1: StatePath, path2: StatePath): boolean {
    if (path1.segments.length !== path2.segments.length) return false;

    return path1.segments.every((segment, index) => segment === path2.segments[index]);
  }

  /**
   * Check if path should skip multiplayer prefix
   */
  static shouldSkipMultiplayerPrefix(path: StatePath): boolean {
    return path.segments.length > 0 && path.segments[0] === MULTIPLAYER_STATE_KEY;
  }

  // ============================================================================
  // OBJECT NAVIGATION
  // ============================================================================

  /**
   * Navigate to a path in an object and return the result
   */
  static navigate<T = unknown>(
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

  /**
   * Get value at path in object
   */
  static getValue<T = unknown>(obj: Record<string, unknown>, path: StatePath): T | undefined {
    const result = PathManager.navigate<T>(obj, path);
    return result.found ? result.value : undefined;
  }

  /**
   * Set value at path in object (creates nested structure if needed)
   */
  static setValue(obj: Record<string, unknown>, path: StatePath, value: unknown): void {
    if (path.segments.length === 0) return;

    let current = obj;

    // Navigate to the parent of the target
    for (let i = 0; i < path.segments.length - 1; i++) {
      const segment = path.segments[i];

      if (!current[segment] || !isPlainObject(current[segment])) {
        current[segment] = {};
      }

      current = current[segment] as Record<string, unknown>;
    }

    // Set the final value
    const lastSegment = path.segments[path.segments.length - 1];
    current[lastSegment] = value;
  }

  /**
   * Delete value at path in object
   */
  static deleteValue(obj: Record<string, unknown>, path: StatePath): boolean {
    const result = PathManager.navigate(obj, path);

    if (result.found && result.parent && result.key) {
      delete result.parent[result.key];
      return true;
    }

    return false;
  }

  /**
   * Check if path exists in object
   */
  static hasPath(obj: Record<string, unknown>, path: StatePath): boolean {
    return PathManager.navigate(obj, path).found;
  }

  // ============================================================================
  // STATE UPDATE BUILDING
  // ============================================================================

  /**
   * Build state update object for setting a value at path
   */
  static buildSetUpdate(
    path: StatePath,
    value: unknown,
    currentState?: Record<string, unknown>,
  ): Record<string, unknown> {
    const update: Record<string, unknown> = {};
    let current = update;
    let currentStateTraversal = currentState;

    // Build path to the update point
    for (let i = 0; i < path.segments.length - 1; i++) {
      const segment = path.segments[i];

      if (PathManager.shouldCloneExistingObject(currentStateTraversal, segment)) {
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

  /**
   * Build state update object for deleting a value at path
   */
  static buildDeleteUpdate(
    path: StatePath,
    currentState: Record<string, unknown>,
    initialState?: Record<string, unknown>,
  ): Record<string, unknown> {
    const pathExists = PathManager.hasPath(currentState, path);
    if (!pathExists) {
      return {};
    }

    const update: Record<string, unknown> = {};
    let current = update;
    let currentStateTraversal = currentState;

    // Build path to the deletion point
    for (let i = 0; i < path.segments.length - 1; i++) {
      const segment = path.segments[i];

      if (PathManager.shouldCloneExistingObject(currentStateTraversal, segment)) {
        current[segment] = { ...(currentStateTraversal[segment] as Record<string, unknown>) };
      } else {
        return {};
      }

      current = current[segment] as Record<string, unknown>;
      currentStateTraversal = currentStateTraversal?.[segment] as Record<string, unknown>;
    }

    PathManager.processDeletion(path, current, update, initialState, currentState);

    return update;
  }

  /**
   * Process deletion logic for different path depths
   */
  private static processDeletion(
    path: StatePath,
    current: Record<string, unknown>,
    stateUpdate: Record<string, unknown>,
    initialState?: Record<string, unknown>,
    currentState?: Record<string, unknown>,
  ): void {
    const lastSegment = path.segments[path.segments.length - 1];

    if (path.depth >= 3) {
      PathManager.handleNestedDeletion(path, current, stateUpdate, currentState);
    } else if (path.depth === 1) {
      PathManager.handleTopLevelDeletion(path, stateUpdate, initialState);
    } else {
      delete current[lastSegment];
    }
  }

  /**
   * Handle deletion of nested objects (depth >= 3)
   */
  private static handleNestedDeletion(
    path: StatePath,
    current: Record<string, unknown>,
    stateUpdate: Record<string, unknown>,
    currentState?: Record<string, unknown>,
  ): void {
    const lastSegment = path.segments[path.segments.length - 1];
    delete current[lastSegment];

    if (path.depth >= 3 && currentState) {
      const parentPath = PathManager.getParent(path);

      const parentResult = PathManager.navigate(currentState, parentPath);

      if (parentResult.found && parentResult.value && isPlainObject(parentResult.value)) {
        const parentObject = parentResult.value as Record<string, unknown>;

        const remainingKeys = Object.keys(parentObject).filter(key => key !== lastSegment);

        if (remainingKeys.length === 0) {
          const grandparentPath = PathManager.getParent(parentPath);

          if (grandparentPath.segments.length === 0) {
            const parentKey = parentPath.segments[parentPath.segments.length - 1];
            delete stateUpdate[parentKey];
          } else {
            const grandparentResult = PathManager.navigate(stateUpdate, grandparentPath);

            if (grandparentResult.found && grandparentResult.parent && grandparentResult.key) {
              const parentKey = parentPath.segments[parentPath.segments.length - 1];
              delete grandparentResult.parent[parentKey];
            } else if (
              grandparentResult.found &&
              grandparentResult.value &&
              isPlainObject(grandparentResult.value)
            ) {
              const parentKey = parentPath.segments[parentPath.segments.length - 1];
              const grandparentObj = grandparentResult.value as Record<string, unknown>;
              delete grandparentObj[parentKey];
            }
          }
        }
      }
    }
  }

  /**
   * Handle top-level deletion (depth === 1)
   */
  private static handleTopLevelDeletion(
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

  /**
   * Check if we should clone an existing object during state building
   */
  private static shouldCloneExistingObject(
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

  // ============================================================================
  // VALIDATION AND UTILITIES
  // ============================================================================

  /**
   * Validate that a path doesn't exceed maximum depth
   */
  static validateDepth(path: StatePath): boolean {
    return path.depth <= MAX_DEPTH;
  }

  /**
   * Sanitize path segments (remove empty strings, trim whitespace)
   */
  static sanitize(path: StatePath): StatePath {
    const sanitizedSegments = path.segments
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0);

    return PathManager.createPath(sanitizedSegments);
  }

  /**
   * Check if a path is safe for storage operations
   */
  static isSafeForStorage(path: StatePath): boolean {
    return (
      PathManager.validateDepth(path) &&
      path.segments.every(
        segment =>
          segment.length > 0 && !segment.includes('\0') && segment !== '..' && segment !== '.',
      )
    );
  }

  /**
   * Get all possible parent paths for a given path
   */
  static getParentPaths(path: StatePath): StatePath[] {
    const parents: StatePath[] = [];

    for (let i = 1; i < path.segments.length; i++) {
      parents.push(PathManager.createPath(path.segments.slice(0, i)));
    }

    return parents;
  }

  /**
   * Get the root segment of a path
   */
  static getRoot(path: StatePath): string | undefined {
    return path.segments[0];
  }

  /**
   * Check if path represents a leaf node (no further nesting expected)
   */
  static isLeafPath(path: StatePath): boolean {
    return path.depth >= MAX_DEPTH;
  }

  /**
   * Recursively clean up empty objects from a state update
   * Moved from multiplayer-orchestrator to centralize cleanup logic
   * Preserves top-level properties as empty objects to maintain state structure
   */
  static cleanupEmptyObjects(
    obj: Record<string, any>,
    isTopLevel: boolean = true,
  ): Record<string, any> {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }

    const cleaned: Record<string, any> = {};
    let hasNonEmptyValues = false;

    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const cleanedValue = PathManager.cleanupEmptyObjects(value, false);

        // For top-level properties, always preserve them even if empty
        // For nested properties, only keep if they have content
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

    // For top-level, always return the cleaned object (even if empty)
    // For nested levels, only return if it has content
    return isTopLevel || hasNonEmptyValues ? cleaned : {};
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert legacy path array to StatePath
 */
export function fromLegacyPath(pathArray: string[]): StatePath {
  return PathManager.createPath(pathArray);
}

/**
 * Convert StatePath to legacy path array
 */
export function toLegacyPath(path: StatePath): string[] {
  return [...path.segments];
}

/**
 * Batch process multiple paths
 */
export function batchProcessPaths<T>(paths: StatePath[], processor: (path: StatePath) => T): T[] {
  return paths.map(processor);
}

/**
 * Filter paths by depth
 */
export function filterPathsByDepth(
  paths: StatePath[],
  minDepth: number = 0,
  maxDepth: number = MAX_DEPTH,
): StatePath[] {
  return paths.filter(path => path.depth >= minDepth && path.depth <= maxDepth);
}
