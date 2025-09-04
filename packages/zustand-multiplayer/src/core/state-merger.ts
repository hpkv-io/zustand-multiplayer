import { isPlainObject } from '../utils';
import { DEFAULT_Z_FACTOR } from '../utils/constants';
import { encodeKeySegment, decodeKeySegment } from '../utils/key-encoder';

/**
 * Manages state merging and update operations for the multiplayer system
 */
export class StateMerger<TState> {
  constructor(private readonly zFactor: number = DEFAULT_Z_FACTOR) {}

  buildStateUpdate(path: string, value: unknown, currentState: TState): Partial<TState> {
    const segments = path.split('.');
    const isDeleting = value === null || value === undefined;

    // Use smart merge for deep paths beyond zFactor
    if (segments.length > this.zFactor && !isDeleting) {
      return this.buildMergeUpdate(segments, value, currentState);
    }

    return this.buildDirectUpdate(currentState, segments, value, isDeleting);
  }

  extractPaths(
    obj: unknown,
    parentPath: string[],
    maxDepth: number,
    currentDepth: number = 0,
  ): Array<{ path: string[]; value: unknown }> {
    if (currentDepth >= maxDepth || !isPlainObject(obj)) {
      return [{ path: parentPath, value: obj }];
    }

    const paths: Array<{ path: string[]; value: unknown }> = [];
    for (const [key, value] of Object.entries(obj)) {
      // Encode the key to handle special characters
      const encodedKey = encodeKeySegment(key);
      const currentPath = [...parentPath, encodedKey];

      if (value === null || !isPlainObject(value)) {
        paths.push({ path: currentPath, value });
      } else {
        paths.push(...this.extractPaths(value, currentPath, maxDepth, currentDepth + 1));
      }
    }

    return paths;
  }

  private mergeObjects(
    current: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...current };

    for (const [key, value] of Object.entries(incoming)) {
      if (value === null || value === undefined) {
        delete result[key];
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private buildDirectUpdate(
    currentState: TState,
    segments: string[],
    value: unknown,
    isDeleting: boolean,
  ): Partial<TState> {
    const fieldName = segments[0];

    if (segments.length === 1) {
      return { [fieldName]: value } as Partial<TState>;
    }

    const clonedField = this.cloneValue((currentState as Record<string, unknown>)[fieldName]) || {};
    this.applyNestedUpdate(clonedField, segments.slice(1), value, isDeleting);

    return { [fieldName]: clonedField } as Partial<TState>;
  }

  setNestedValue(obj: Record<string, unknown>, segments: string[], value: unknown): void {
    if (segments.length === 0) return;

    let current = obj;
    for (let i = 0; i < segments.length - 1; i++) {
      // Decode the segment to restore original key
      const segment = decodeKeySegment(segments[i]);
      if (!isPlainObject(current[segment])) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }

    // Decode the final segment key as well
    const finalKey = decodeKeySegment(segments[segments.length - 1]);
    current[finalKey] = value;
  }

  private buildMergeUpdate(
    segments: string[],
    value: unknown,
    currentState: TState,
  ): Partial<TState> {
    const currentValue = this.getNestedValue(currentState, segments);

    if (isPlainObject(currentValue) && isPlainObject(value)) {
      const merged = this.mergeObjects(currentValue, value);
      return this.buildDirectUpdate(currentState, segments, merged, false);
    }

    return this.buildDirectUpdate(currentState, segments, value, false);
  }

  private getNestedValue(state: TState, segments: string[]): unknown {
    // Decode the first segment
    const firstKey = decodeKeySegment(segments[0]);
    let current = (state as Record<string, unknown>)[firstKey] as Record<string, unknown>;

    for (let i = 1; i <= this.zFactor && i < segments.length; i++) {
      // Check if object is extensible before adding properties
      if (!Object.isExtensible(current)) {
        // Return a copy of the non-extensible object to allow merging
        current = { ...current };
      }
      // Decode each segment key
      const segmentKey = decodeKeySegment(segments[i]);
      current[segmentKey] ??= {};
      current = current[segmentKey] as Record<string, unknown>;
    }

    return current;
  }

  private cloneValue(value: unknown): Record<string, unknown> {
    if (isPlainObject(value)) {
      return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    }
    return {};
  }

  private applyNestedUpdate(
    target: Record<string, unknown>,
    segments: string[],
    value: unknown,
    isDeleting: boolean,
  ): void {
    const parent = this.navigateToParent(target, segments);
    // Decode the last segment key
    const lastSegment = decodeKeySegment(segments[segments.length - 1]);

    if (isDeleting) {
      delete parent.current[lastSegment];
      this.cleanupEmptyParents(parent.path);
    } else {
      parent.current[lastSegment] = value;
    }
  }

  private navigateToParent(
    target: Record<string, unknown>,
    segments: string[],
  ): {
    current: Record<string, unknown>;
    path: Array<{ obj: Record<string, unknown>; key: string }>;
  } {
    let current = target;
    const path: Array<{ obj: Record<string, unknown>; key: string }> = [];

    for (let i = 0; i < segments.length - 1; i++) {
      // Decode each segment key
      const segment = decodeKeySegment(segments[i]);
      if (!isPlainObject(current[segment])) {
        current[segment] = {};
      }
      path.push({ obj: current, key: segment });
      current = current[segment] as Record<string, unknown>;
    }

    return { current, path };
  }

  private cleanupEmptyParents(path: Array<{ obj: Record<string, unknown>; key: string }>): void {
    for (let i = path.length - 1; i >= 0; i--) {
      const { obj, key } = path[i];
      const value = obj[key];

      if (isPlainObject(value) && Object.keys(value as object).length === 0) {
        delete obj[key];
      } else {
        break;
      }
    }
  }
}
