import { describe, it, expect } from 'vitest';
import { PathManager } from '../../../src/utils/path-manager';
import { extractPaths } from '../../../src/utils/state-utils';

describe('PathManager', () => {
  describe('Core Path Operations', () => {
    it('should create paths from segments', () => {
      const path = PathManager.createPath(['user', 'profile', 'name']);
      expect(path.segments).toEqual(['user', 'profile', 'name']);
      expect(path.isNested).toBe(true);
      expect(path.depth).toBe(3);
    });

    it('should handle root paths', () => {
      const path = PathManager.createPath(['user']);
      expect(path.segments).toEqual(['user']);
      expect(path.isNested).toBe(false);
      expect(path.depth).toBe(1);
    });

    it('should handle empty paths', () => {
      const path = PathManager.createPath([]);
      expect(path.segments).toEqual([]);
      expect(path.isNested).toBe(false);
      expect(path.depth).toBe(0);
    });

    it('should create paths from strings', () => {
      const path = PathManager.fromString('user:profile:name');
      expect(path.segments).toEqual(['user', 'profile', 'name']);
      expect(path.depth).toBe(3);

      // With custom separator
      const pathDot = PathManager.fromString('user.profile.name', '.');
      expect(pathDot.segments).toEqual(['user', 'profile', 'name']);
    });
  });

  describe('Path Comparison and Navigation', () => {
    it('should compare paths correctly', () => {
      const path1 = PathManager.createPath(['user', 'name']);
      const path2 = PathManager.createPath(['user', 'name']);
      const path3 = PathManager.createPath(['user', 'age']);

      expect(PathManager.equals(path1, path2)).toBe(true);
      expect(PathManager.equals(path1, path3)).toBe(false);
    });

    it('should get parent paths', () => {
      const path = PathManager.createPath(['user', 'profile', 'name']);
      const parent = PathManager.getParent(path);

      expect(parent.segments).toEqual(['user', 'profile']);
      expect(parent.depth).toBe(2);
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
      const path = PathManager.createPath(['user', 'name']);

      const result = PathManager.navigate(state, path);
      expect(result.found).toBe(true);
      expect(result.value).toBe('John');
    });

    it('should handle non-existing paths', () => {
      const state = {
        user: {
          name: 'John',
        },
      };
      const path = PathManager.createPath(['user', 'email']);

      const result = PathManager.navigate(state, path);
      expect(result.found).toBe(false);
      expect(result.value).toBeUndefined();
    });

    it('should check if paths exist', () => {
      const state = { user: { name: 'John' } };
      const existingPath = PathManager.createPath(['user', 'name']);
      const nonExistingPath = PathManager.createPath(['user', 'email']);

      expect(PathManager.hasPath(state, existingPath)).toBe(true);
      expect(PathManager.hasPath(state, nonExistingPath)).toBe(false);
    });
  });

  describe('State Building', () => {
    it('should build set updates', () => {
      const currentState = { count: 0, text: 'old' };
      const path = PathManager.createPath(['count']);

      const update = PathManager.buildSetUpdate(path, 42, currentState);
      expect(update).toEqual({ count: 42 });
    });

    it('should build delete updates', () => {
      const currentState = { count: 42, text: 'hello' };
      const initialState = { count: 0 };
      const path = PathManager.createPath(['text']);

      const update = PathManager.buildDeleteUpdate(path, currentState, initialState);
      // Delete updates work differently - they might not preserve other fields
      expect(update).not.toHaveProperty('text');
    });
  });

  describe('Integration with State Utils', () => {
    it('should work with extractPaths from state-utils', () => {
      const state = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      };

      const paths = extractPaths(state);
      expect(paths.length).toBeGreaterThan(0);

      // Convert to PathManager format for consistency
      const pathObjects = paths.map(p => PathManager.createPath(p.path));
      expect(pathObjects.every(p => p.segments.length > 0)).toBe(true);
    });
  });
});
