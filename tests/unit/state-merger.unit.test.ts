import { describe, it, expect, beforeEach } from 'vitest';
import { StateMerger } from '../../src/core/state-merger';

describe('StateMerger', () => {
  let merger: StateMerger<any>;

  beforeEach(() => {
    merger = new StateMerger();
  });

  describe('buildStateUpdate', () => {
    it('should handle simple property updates', () => {
      const currentState = { a: 1, b: 2 };
      const result = merger.buildStateUpdate('a', 10, currentState);

      expect(result).toEqual({ a: 10 });
    });

    it('should handle nested property updates', () => {
      const currentState = { user: { name: 'John', age: 30 } };
      const result = merger.buildStateUpdate('user.name', 'Jane', currentState);

      expect(result).toEqual({ user: { name: 'Jane', age: 30 } });
    });

    it('should handle deep nested property updates', () => {
      const currentState = {
        config: {
          database: {
            connection: {
              host: 'localhost',
              port: 5432,
            },
          },
        },
      };
      const result = merger.buildStateUpdate('config.database.connection.port', 3306, currentState);

      expect(result).toEqual({
        config: {
          database: {
            connection: {
              host: 'localhost',
              port: 3306,
            },
          },
        },
      });
    });

    it('should handle property deletion with null', () => {
      const currentState = { a: 1, b: 2 };
      const result = merger.buildStateUpdate('b', null, currentState);

      expect(result).toEqual({ b: null });
    });

    it('should handle property deletion with undefined', () => {
      const currentState = { a: 1, b: 2 };
      const result = merger.buildStateUpdate('b', undefined, currentState);

      expect(result).toEqual({ b: undefined });
    });

    it('should handle nested property deletion', () => {
      const currentState = { user: { name: 'John', age: 30 } };
      const result = merger.buildStateUpdate('user.age', null, currentState);

      expect(result).toEqual({ user: { name: 'John' } });
    });

    it('should create nested structure when it does not exist', () => {
      const currentState = { a: 1 };
      const result = merger.buildStateUpdate('b.c.d', 'value', currentState);

      expect(result).toEqual({ b: { c: { d: 'value' } } });
    });

    it('should merge deep objects when depth exceeds zFactor', () => {
      const mergerWithZFactor = new StateMerger(2);
      const currentState = {
        level1: {
          level2: {
            level3: {
              existing: 'value',
              toUpdate: 'old',
            },
          },
        },
      };

      const result = mergerWithZFactor.buildStateUpdate(
        'level1.level2.level3',
        { toUpdate: 'new', added: 'prop' },
        currentState,
      );

      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              existing: 'value',
              toUpdate: 'new',
              added: 'prop',
            },
          },
        },
      });
    });

    it('should handle array values', () => {
      const currentState = { items: [1, 2, 3] };
      const result = merger.buildStateUpdate('items', [4, 5, 6], currentState);

      expect(result).toEqual({ items: [4, 5, 6] });
    });

    it('should handle boolean values', () => {
      const currentState = { isActive: false };
      const result = merger.buildStateUpdate('isActive', true, currentState);

      expect(result).toEqual({ isActive: true });
    });
  });

  describe('extractPaths', () => {
    it('should extract single-level paths', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = merger.extractPaths(obj, [], 1);

      expect(result).toEqual([
        { path: ['a'], value: 1 },
        { path: ['b'], value: 2 },
        { path: ['c'], value: 3 },
      ]);
    });

    it('should extract nested paths up to maxDepth', () => {
      const obj = {
        a: 1,
        b: {
          c: 2,
          d: {
            e: 3,
          },
        },
      };
      const result = merger.extractPaths(obj, [], 2);

      expect(result).toEqual([
        { path: ['a'], value: 1 },
        { path: ['b', 'c'], value: 2 },
        { path: ['b', 'd'], value: { e: 3 } },
      ]);
    });

    it('should respect maxDepth limit', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              level4: 'deep',
            },
          },
        },
      };
      const result = merger.extractPaths(obj, [], 2);

      expect(result).toEqual([
        { path: ['level1', 'level2'], value: { level3: { level4: 'deep' } } },
      ]);
    });

    it('should handle null values', () => {
      const obj = { a: 1, b: null, c: { d: null } };
      const result = merger.extractPaths(obj, [], 2);

      expect(result).toEqual([
        { path: ['a'], value: 1 },
        { path: ['b'], value: null },
        { path: ['c', 'd'], value: null },
      ]);
    });

    it('should handle array values as terminal nodes', () => {
      const obj = { a: [1, 2, 3], b: { c: [4, 5] } };
      const result = merger.extractPaths(obj, [], 2);

      expect(result).toEqual([
        { path: ['a'], value: [1, 2, 3] },
        { path: ['b', 'c'], value: [4, 5] },
      ]);
    });

    it('should handle empty objects', () => {
      const obj = {};
      const result = merger.extractPaths(obj, [], 2);

      expect(result).toEqual([]);
    });

    it('should handle primitives at root level', () => {
      const result = merger.extractPaths('string', [], 2);

      expect(result).toEqual([{ path: [], value: 'string' }]);
    });

    it('should use parent path correctly', () => {
      const obj = { a: 1, b: { c: 2 } };
      const result = merger.extractPaths(obj, ['root'], 2);

      expect(result).toEqual([
        { path: ['root', 'a'], value: 1 },
        { path: ['root', 'b', 'c'], value: 2 },
      ]);
    });
  });

  describe('setNestedValue', () => {
    it('should set a simple value', () => {
      const obj = {};
      merger.setNestedValue(obj, ['a'], 1);

      expect(obj).toEqual({ a: 1 });
    });

    it('should set a nested value', () => {
      const obj = {};
      merger.setNestedValue(obj, ['a', 'b', 'c'], 'value');

      expect(obj).toEqual({ a: { b: { c: 'value' } } });
    });

    it('should overwrite existing values', () => {
      const obj = { a: { b: 'old' } };
      merger.setNestedValue(obj, ['a', 'b'], 'new');

      expect(obj).toEqual({ a: { b: 'new' } });
    });

    it('should create nested structure when overwriting non-object', () => {
      const obj = { a: 'string' };
      merger.setNestedValue(obj, ['a', 'b', 'c'], 'value');

      expect(obj).toEqual({ a: { b: { c: 'value' } } });
    });

    it('should handle empty segments array', () => {
      const obj = { existing: 'value' };
      merger.setNestedValue(obj, [], 'new');

      expect(obj).toEqual({ existing: 'value' });
    });

    it('should handle array indices as segments', () => {
      const obj: any = {};
      merger.setNestedValue(obj, ['items', '0'], 'first');

      expect(obj).toEqual({ items: { '0': 'first' } });
    });
  });

  describe('edge cases', () => {
    it('should handle empty state updates', () => {
      const currentState = {};
      const result = merger.buildStateUpdate('a', 1, currentState);

      expect(result).toEqual({ a: 1 });
    });

    it('should handle updating root with complex object', () => {
      const currentState = { a: 1 };
      const newValue = { b: 2, c: { d: 3 } };
      const result = merger.buildStateUpdate('nested', newValue, currentState);

      expect(result).toEqual({ nested: newValue });
    });

    it('should handle special characters in path segments', () => {
      const currentState = {};
      const result = merger.buildStateUpdate('user.email@domain.com', 'value', currentState);

      // Note: This treats 'email@domain' and 'com' as separate segments due to the dot
      expect(result).toEqual({ user: { 'email@domain': { com: 'value' } } });
    });

    it('should handle numeric string keys', () => {
      const currentState = {};
      const result = merger.buildStateUpdate('data.123.value', 'test', currentState);

      expect(result).toEqual({ data: { '123': { value: 'test' } } });
    });

    it('should clean up empty parent objects after deletion', () => {
      const currentState = {
        parent: {
          child: {
            grandchild: 'value',
          },
        },
      };
      const result = merger.buildStateUpdate('parent.child.grandchild', null, currentState);

      expect(result).toEqual({ parent: {} });
    });

    it('should preserve other properties when updating nested values', () => {
      const currentState = {
        user: {
          name: 'John',
          age: 30,
          address: {
            city: 'New York',
            zip: '10001',
          },
        },
        settings: {
          theme: 'dark',
        },
      };

      const result = merger.buildStateUpdate('user.address.city', 'Boston', currentState);

      expect(result).toEqual({
        user: {
          name: 'John',
          age: 30,
          address: {
            city: 'Boston',
            zip: '10001',
          },
        },
      });
    });

    it('should handle non-extensible objects', () => {
      const frozen = Object.freeze({ inner: 'value' });
      const currentState = { data: frozen };

      // The merger should create a copy when encountering non-extensible objects
      const result = merger.buildStateUpdate('data.inner', 'new', currentState);

      expect(result.data).not.toBe(frozen);
      expect(result).toEqual({ data: { inner: 'new' } });
    });
  });

  describe('with custom zFactor', () => {
    it('should use direct update when path depth is within zFactor', () => {
      const mergerZ1 = new StateMerger(1);
      const currentState = {
        level1: {
          level2: {
            existing: 'value',
          },
        },
      };

      const result = mergerZ1.buildStateUpdate('level1.level2', { new: 'data' }, currentState);

      // With zFactor=1 and path depth=2, it should merge (depth > zFactor)
      expect(result).toEqual({
        level1: {
          level2: {
            existing: 'value',
            new: 'data',
          },
        },
      });
    });

    it('should use merge update when path depth exceeds zFactor', () => {
      const mergerZ1 = new StateMerger(1);
      const currentState = {
        level1: {
          level2: {
            existing: 'value',
            toUpdate: 'old',
          },
        },
      };

      const result = mergerZ1.buildStateUpdate(
        'level1.level2',
        { toUpdate: 'new', added: 'prop' },
        currentState,
      );

      // Should merge with existing properties
      expect(result).toEqual({
        level1: {
          level2: {
            existing: 'value',
            toUpdate: 'new',
            added: 'prop',
          },
        },
      });
    });

    it('should handle zFactor of 0', () => {
      const mergerZ0 = new StateMerger(0);
      const currentState = { a: { b: 'old' } };

      const result = mergerZ0.buildStateUpdate('a', { b: 'new', c: 'added' }, currentState);

      // With zFactor 0, everything should use merge
      expect(result).toEqual({
        a: { b: 'new', c: 'added' },
      });
    });
  });
});
