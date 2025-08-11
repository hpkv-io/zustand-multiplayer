import { describe, it, expect } from 'vitest';
import {
  encodeKeySegment,
  decodeKeySegment,
  encodePathSegments,
  decodePathSegments,
} from '../../src/utils/key-encoder';

describe('Key Encoder Unit Tests', () => {
  describe('encodeKeySegment', () => {
    it('should encode special characters', () => {
      expect(encodeKeySegment('hello:world')).toBe('hello%3Aworld');
      expect(encodeKeySegment('path.to.value')).toBe('path%2Eto%2Evalue');
      expect(encodeKeySegment('pipe|value')).toBe('pipe%7Cvalue');
      expect(encodeKeySegment('dollar$value')).toBe('dollar%24value');
      expect(encodeKeySegment('hash#value')).toBe('hash%23value');
      expect(encodeKeySegment('ampersand&value')).toBe('ampersand%26value');
      expect(encodeKeySegment('equals=value')).toBe('equals%3Dvalue');
      expect(encodeKeySegment('plus+value')).toBe('plus%2Bvalue');
      expect(encodeKeySegment('hello world')).toBe('hello%20world');
    });

    it('should encode percent signs first to avoid double encoding', () => {
      expect(encodeKeySegment('already%encoded')).toBe('already%25encoded');
      expect(encodeKeySegment('50%off')).toBe('50%25off');
    });

    it('should handle multiple special characters', () => {
      expect(encodeKeySegment('user:name.first$test')).toBe('user%3Aname%2Efirst%24test');
      expect(encodeKeySegment('path/with spaces & symbols')).toBe(
        'path/with%20spaces%20%26%20symbols',
      );
    });

    it('should handle empty string', () => {
      expect(encodeKeySegment('')).toBe('');
    });

    it('should not modify regular characters', () => {
      expect(encodeKeySegment('normaltext123_-')).toBe('normaltext123_-');
    });
  });

  describe('decodeKeySegment', () => {
    it('should decode special characters', () => {
      expect(decodeKeySegment('hello%3Aworld')).toBe('hello:world');
      expect(decodeKeySegment('path%2Eto%2Evalue')).toBe('path.to.value');
      expect(decodeKeySegment('pipe%7Cvalue')).toBe('pipe|value');
      expect(decodeKeySegment('dollar%24value')).toBe('dollar$value');
      expect(decodeKeySegment('hash%23value')).toBe('hash#value');
      expect(decodeKeySegment('ampersand%26value')).toBe('ampersand&value');
      expect(decodeKeySegment('equals%3Dvalue')).toBe('equals=value');
      expect(decodeKeySegment('plus%2Bvalue')).toBe('plus+value');
      expect(decodeKeySegment('hello%20world')).toBe('hello world');
    });

    it('should decode percent signs last', () => {
      expect(decodeKeySegment('already%25encoded')).toBe('already%encoded');
      expect(decodeKeySegment('50%25off')).toBe('50%off');
    });

    it('should handle multiple encoded characters', () => {
      expect(decodeKeySegment('user%3Aname%2Efirst%24test')).toBe('user:name.first$test');
      expect(decodeKeySegment('path/with%20spaces%20%26%20symbols')).toBe(
        'path/with spaces & symbols',
      );
    });

    it('should handle empty string', () => {
      expect(decodeKeySegment('')).toBe('');
    });

    it('should not modify regular characters', () => {
      expect(decodeKeySegment('normaltext123_-')).toBe('normaltext123_-');
    });
  });

  describe('encode/decode roundtrip', () => {
    it('should maintain data integrity through encode/decode cycle', () => {
      const testCases = [
        'user:profile.name',
        'path with spaces',
        'special&chars=test+value',
        'percent%already',
        'complex:path.to|value$with#symbols',
        'empty',
        '123numbers',
        '',
        'unicode™test',
      ];

      testCases.forEach(testCase => {
        const encoded = encodeKeySegment(testCase);
        const decoded = decodeKeySegment(encoded);
        expect(decoded).toBe(testCase);
      });
    });
  });

  describe('encodePathSegments', () => {
    it('should encode array of path segments', () => {
      const input = ['user:123', 'profile.data', 'name with spaces'];
      const expected = ['user%3A123', 'profile%2Edata', 'name%20with%20spaces'];
      expect(encodePathSegments(input)).toEqual(expected);
    });

    it('should handle empty array', () => {
      expect(encodePathSegments([])).toEqual([]);
    });

    it('should handle single segment', () => {
      expect(encodePathSegments(['test:value'])).toEqual(['test%3Avalue']);
    });
  });

  describe('decodePathSegments', () => {
    it('should decode array of path segments', () => {
      const input = ['user%3A123', 'profile%2Edata', 'name%20with%20spaces'];
      const expected = ['user:123', 'profile.data', 'name with spaces'];
      expect(decodePathSegments(input)).toEqual(expected);
    });

    it('should handle empty array', () => {
      expect(decodePathSegments([])).toEqual([]);
    });

    it('should handle single segment', () => {
      expect(decodePathSegments(['test%3Avalue'])).toEqual(['test:value']);
    });
  });

  describe('path segments roundtrip', () => {
    it('should maintain data integrity through encode/decode cycle', () => {
      const testCases = [
        ['user:123', 'profile.name', 'value with spaces'],
        ['path:to.deeply|nested$value'],
        [''],
        ['simple', 'path'],
        [],
      ];

      testCases.forEach(testCase => {
        const encoded = encodePathSegments(testCase);
        const decoded = decodePathSegments(encoded);
        expect(decoded).toEqual(testCase);
      });
    });
  });
});
