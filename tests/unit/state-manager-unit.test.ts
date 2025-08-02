import { describe, it, expect } from 'vitest';
import {
  createPath,
  navigate,
  hasPath,
  buildSetUpdate,
  buildDeleteUpdate,
  extractPaths,
} from '../../src/core/state-manager';

describe('StateManager Unit Tests', () => {
  describe('Core Path Operations', () => {
    it('should create paths from segments', () => {
      const path = createPath(['user', 'profile', 'name']);
      expect(path.segments).toEqual(['user', 'profile', 'name']);
      expect(path.isNested).toBe(true);
      expect(path.depth).toBe(3);
    });

    it('should handle root paths', () => {
      const path = createPath(['user']);
      expect(path.segments).toEqual(['user']);
      expect(path.isNested).toBe(false);
      expect(path.depth).toBe(1);
    });

    it('should handle empty paths', () => {
      const path = createPath([]);
      expect(path.segments).toEqual([]);
      expect(path.isNested).toBe(false);
      expect(path.depth).toBe(0);
    });
  });

  describe('Object Navigation', () => {
    it('should navigate to existing paths', () => {
      const state = {
        user: {
          name: 'John',
          profile: { age: 30 },
        },
      };
      const path = createPath(['user', 'name']);

      const result = navigate(state, path);
      expect(result.found).toBe(true);
      expect(result.value).toBe('John');
    });

    it('should handle non-existing paths', () => {
      const state = {
        user: {
          name: 'John',
        },
      };
      const path = createPath(['user', 'email']);

      const result = navigate(state, path);
      expect(result.found).toBe(false);
      expect(result.value).toBeUndefined();
    });

    it('should check if paths exist', () => {
      const state = { user: { name: 'John' } };
      const existingPath = createPath(['user', 'name']);
      const nonExistingPath = createPath(['user', 'email']);

      expect(hasPath(state, existingPath)).toBe(true);
      expect(hasPath(state, nonExistingPath)).toBe(false);
    });
  });

  describe('State Building', () => {
    it('should build set updates', () => {
      const currentState = { count: 0, text: 'old' };
      const path = createPath(['count']);

      const update = buildSetUpdate(path, 42, currentState);
      expect(update).toEqual({ count: 42 });
    });

    it('should build delete updates', () => {
      const currentState = { count: 42, text: 'hello' };
      const initialState = { count: 0 };
      const path = createPath(['text']);

      const update = buildDeleteUpdate(path, currentState, initialState);
      expect(update).not.toHaveProperty('text');
    });
  });

  describe('Integration with State Utils', () => {
    it('should work with extractPaths from PathOperations', () => {
      const state = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      };

      const paths = extractPaths(state);
      expect(paths.length).toBeGreaterThan(0);

      const pathObjects = paths.map(p => createPath(p.path));
      expect(pathObjects.every(p => p.segments.length > 0)).toBe(true);
    });
  });
});
