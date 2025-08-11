import { isPlainObject } from '../utils';

/**
 * Manages state diffing and comparison operations for efficient synchronization
 */
export class StateDiffManager {
  calculateDiff(oldValue: unknown, newValue: unknown): { type: 'full' | 'diff'; data: unknown } {
    if (oldValue === undefined || !isPlainObject(oldValue) || !isPlainObject(newValue)) {
      return { type: 'full', data: newValue };
    }

    const diff = this.calculateObjectDiff(oldValue, newValue);
    return Object.keys(diff).length > 0
      ? { type: 'diff', data: diff }
      : { type: 'full', data: newValue };
  }

  private calculateObjectDiff(
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
  ): Record<string, unknown> {
    const diff: Record<string, unknown> = {};
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const diffValue = this.getDiffForKey(key, oldObj, newObj);
      if (diffValue !== undefined) {
        diff[key] = diffValue;
      }
    }

    return diff;
  }

  private getDiffForKey(
    key: string,
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
  ): unknown {
    const hasOldKey = key in oldObj;
    const hasNewKey = key in newObj;

    if (hasOldKey && !hasNewKey) return null; // Deletion
    if (!hasOldKey && hasNewKey) return newObj[key]; // Addition

    const oldValue = oldObj[key];
    const newValue = newObj[key];

    if (this.isDeepEqual(oldValue, newValue)) return undefined; // No change

    // Nested object diff
    if (isPlainObject(oldValue) && isPlainObject(newValue)) {
      const nestedDiff = this.calculateObjectDiff(oldValue, newValue);
      return Object.keys(nestedDiff).length > 0 ? nestedDiff : undefined;
    }

    return newValue; // Value change
  }

  isDeepEqual(value1: unknown, value2: unknown, visited?: WeakSet<object>): boolean {
    if (value1 === value2) return true;
    if (value1 === null || value2 === null) return value1 === value2;
    if (typeof value1 !== typeof value2) return false;

    if (Array.isArray(value1) && Array.isArray(value2)) {
      if (value1.length !== value2.length) return false;

      // Initialize visited set if not provided
      const visitedSet = visited ?? new WeakSet<object>();

      // Check for circular reference
      if (visitedSet.has(value1) || visitedSet.has(value2)) {
        return value1 === value2;
      }

      visitedSet.add(value1);
      visitedSet.add(value2);

      return value1.every((item, index) => this.isDeepEqual(item, value2[index], visitedSet));
    }

    if (typeof value1 === 'object' && typeof value2 === 'object') {
      // Initialize visited set if not provided
      const visitedSet = visited ?? new WeakSet<object>();

      // Check for circular reference
      if (visitedSet.has(value1) || visitedSet.has(value2)) {
        return value1 === value2;
      }

      visitedSet.add(value1);
      visitedSet.add(value2);

      const keys1 = Object.keys(value1);
      const keys2 = Object.keys(value2);
      return (
        keys1.length === keys2.length &&
        keys1.every(
          key =>
            key in value2 &&
            this.isDeepEqual(
              (value1 as Record<string, unknown>)[key],
              (value2 as Record<string, unknown>)[key],
              visitedSet,
            ),
        )
      );
    }

    return false;
  }
}
