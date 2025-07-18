import { PATH_SEPARATOR, MULTIPLAYER_FIELD as MULTIPLAYER_STATE_KEY, MAX_DEPTH } from './constants';
import { isPlainObject } from './index';

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
   * Create a StatePath from an array of segments
   */
  static fromArray(pathArray: string[]): StatePath {
    return PathManager.createPath(pathArray);
  }

  /**
   * Get parent path (all segments except the last)
   */
  static getParent(path: StatePath): StatePath {
    if (path.segments.length <= 1) return PathManager.EMPTY_PATH;

    return PathManager.createPath(path.segments.slice(0, -1));
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

    const lastSegment = path.segments[path.segments.length - 1];
    current[lastSegment] = value;
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

    if (path.depth >= MAX_DEPTH) {
      PathManager.handleNestedDeletion(path, current, stateUpdate, currentState);
    } else if (path.depth === 1) {
      PathManager.handleTopLevelDeletion(path, stateUpdate, initialState);
    } else {
      delete current[lastSegment];
    }
  }

  /**
   * Handle deletion of nested objects (depth >= MAX_DEPTH)
   */
  private static handleNestedDeletion(
    path: StatePath,
    current: Record<string, unknown>,
    stateUpdate: Record<string, unknown>,
    currentState?: Record<string, unknown>,
  ): void {
    const lastSegment = path.segments[path.segments.length - 1];
    delete current[lastSegment];

    if (path.depth >= MAX_DEPTH && currentState) {
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

  /**
   * Recursively clean up empty objects from a state update
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

    return isTopLevel || hasNonEmptyValues ? cleaned : {};
  }
}
