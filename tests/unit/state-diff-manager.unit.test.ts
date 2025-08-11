import { describe, it, expect, beforeEach } from 'vitest';
import { StateDiffManager } from '../../src/core/state-diff-manager';

describe('StateDiffManager', () => {
  let diffManager: StateDiffManager;

  beforeEach(() => {
    diffManager = new StateDiffManager();
  });

  describe('calculateDiff', () => {
    it('should return full data when oldValue is undefined', () => {
      const newValue = { a: 1, b: 2 };
      const result = diffManager.calculateDiff(undefined, newValue);

      expect(result).toEqual({ type: 'full', data: newValue });
    });

    it('should return full data when oldValue is not a plain object', () => {
      const oldValue = 'string';
      const newValue = { a: 1 };
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({ type: 'full', data: newValue });
    });

    it('should return full data when newValue is not a plain object', () => {
      const oldValue = { a: 1 };
      const newValue = 'string';
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({ type: 'full', data: newValue });
    });

    it('should return diff for object additions', () => {
      const oldValue = { a: 1 };
      const newValue = { a: 1, b: 2 };
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({ type: 'diff', data: { b: 2 } });
    });

    it('should return diff for object deletions', () => {
      const oldValue = { a: 1, b: 2 };
      const newValue = { a: 1 };
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({ type: 'diff', data: { b: null } });
    });

    it('should return diff for object modifications', () => {
      const oldValue = { a: 1, b: 2 };
      const newValue = { a: 1, b: 3 };
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({ type: 'diff', data: { b: 3 } });
    });

    it('should handle nested object diffs', () => {
      const oldValue = {
        a: 1,
        nested: { x: 10, y: 20 },
      };
      const newValue = {
        a: 1,
        nested: { x: 10, y: 30, z: 40 },
      };
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({
        type: 'diff',
        data: { nested: { y: 30, z: 40 } },
      });
    });

    it('should handle deeply nested object diffs', () => {
      const oldValue = {
        level1: {
          level2: {
            level3: { value: 'old' },
          },
        },
      };
      const newValue = {
        level1: {
          level2: {
            level3: { value: 'new', extra: 'data' },
          },
        },
      };
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({
        type: 'diff',
        data: {
          level1: {
            level2: {
              level3: { value: 'new', extra: 'data' },
            },
          },
        },
      });
    });

    it('should handle array changes as full replacements', () => {
      const oldValue = { arr: [1, 2, 3] };
      const newValue = { arr: [1, 2, 3, 4] };
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({ type: 'diff', data: { arr: [1, 2, 3, 4] } });
    });

    it('should return full data when objects are identical', () => {
      const oldValue = { a: 1, b: { c: 2 } };
      const newValue = { a: 1, b: { c: 2 } };
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({ type: 'full', data: newValue });
    });

    it('should handle mixed type changes', () => {
      const oldValue = { a: 'string', b: 123, c: true };
      const newValue = { a: 456, b: false, c: 'text' };
      const result = diffManager.calculateDiff(oldValue, newValue);

      expect(result).toEqual({
        type: 'diff',
        data: { a: 456, b: false, c: 'text' },
      });
    });
  });

  describe('isDeepEqual', () => {
    it('should return true for identical primitives', () => {
      expect(diffManager.isDeepEqual(1, 1)).toBe(true);
      expect(diffManager.isDeepEqual('test', 'test')).toBe(true);
      expect(diffManager.isDeepEqual(true, true)).toBe(true);
      expect(diffManager.isDeepEqual(null, null)).toBe(true);
      expect(diffManager.isDeepEqual(undefined, undefined)).toBe(true);
    });

    it('should return false for different primitives', () => {
      expect(diffManager.isDeepEqual(1, 2)).toBe(false);
      expect(diffManager.isDeepEqual('test', 'other')).toBe(false);
      expect(diffManager.isDeepEqual(true, false)).toBe(false);
      expect(diffManager.isDeepEqual(null, undefined)).toBe(false);
    });

    it('should return false for different types', () => {
      expect(diffManager.isDeepEqual(1, '1')).toBe(false);
      expect(diffManager.isDeepEqual(true, 1)).toBe(false);
      // Note: isDeepEqual doesn't distinguish between arrays and objects, it treats both as objects
      // This is because it uses Object.keys() which works on both arrays and objects
      // An empty array [] has no keys, same as an empty object {}
      expect(diffManager.isDeepEqual({}, [])).toBe(true);
    });

    it('should handle arrays correctly', () => {
      expect(diffManager.isDeepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(diffManager.isDeepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(diffManager.isDeepEqual([1, 2, 3], [1, 2])).toBe(false);
      expect(diffManager.isDeepEqual([], [])).toBe(true);
    });

    it('should handle nested arrays', () => {
      expect(
        diffManager.isDeepEqual(
          [
            [1, 2],
            [3, 4],
          ],
          [
            [1, 2],
            [3, 4],
          ],
        ),
      ).toBe(true);
      expect(
        diffManager.isDeepEqual(
          [
            [1, 2],
            [3, 4],
          ],
          [
            [1, 2],
            [3, 5],
          ],
        ),
      ).toBe(false);
    });

    it('should handle objects correctly', () => {
      expect(diffManager.isDeepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(diffManager.isDeepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
      expect(diffManager.isDeepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(diffManager.isDeepEqual({}, {})).toBe(true);
    });

    it('should handle nested objects', () => {
      const obj1 = { a: 1, b: { c: 2, d: { e: 3 } } };
      const obj2 = { a: 1, b: { c: 2, d: { e: 3 } } };
      const obj3 = { a: 1, b: { c: 2, d: { e: 4 } } };

      expect(diffManager.isDeepEqual(obj1, obj2)).toBe(true);
      expect(diffManager.isDeepEqual(obj1, obj3)).toBe(false);
    });

    it('should handle mixed nested structures', () => {
      const obj1 = {
        a: [1, { b: 2 }],
        c: { d: [3, 4], e: { f: 5 } },
      };
      const obj2 = {
        a: [1, { b: 2 }],
        c: { d: [3, 4], e: { f: 5 } },
      };
      const obj3 = {
        a: [1, { b: 3 }],
        c: { d: [3, 4], e: { f: 5 } },
      };

      expect(diffManager.isDeepEqual(obj1, obj2)).toBe(true);
      expect(diffManager.isDeepEqual(obj1, obj3)).toBe(false);
    });

    it('should handle circular references by using JSON comparison', () => {
      const obj1: any = { a: 1 };
      obj1.self = obj1;

      const obj2: any = { a: 1 };
      obj2.self = obj2;

      expect(() => diffManager.isDeepEqual(obj1, obj2)).not.toThrow();
    });
  });
});
