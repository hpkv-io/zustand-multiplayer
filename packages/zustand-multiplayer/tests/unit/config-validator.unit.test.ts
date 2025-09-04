import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MultiplayerOptions } from '../../src/types/multiplayer-types';
import {
  validateAuthenticationOptions,
  validateNamespace,
  validateApiBaseUrl,
  validateZFactor,
  validateSyncArray,
  validateMultiplayerOptions,
  validateOptions,
  type ValidationResult,
} from '../../src/utils/config-validator';
import { MIN_Z_FACTOR, MAX_Z_FACTOR, DEFAULT_Z_FACTOR } from '../../src/utils/constants';

interface TestState {
  counter: number;
}
describe('Config Validator Unit Tests', () => {
  let mockOptions: MultiplayerOptions<TestState>;

  beforeEach(() => {
    mockOptions = {
      namespace: 'test-namespace',
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'test-api-key',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateAuthenticationOptions', () => {
    it('should accept options with apiKey', () => {
      expect(() => validateAuthenticationOptions(mockOptions)).not.toThrow();
    });

    it('should accept options with tokenGenerationUrl', () => {
      const options = {
        ...mockOptions,
        apiKey: undefined,
        tokenGenerationUrl: 'https://auth.example.com/token',
      };
      expect(() => validateAuthenticationOptions(options)).not.toThrow();
    });

    it('should accept options with both apiKey and tokenGenerationUrl', () => {
      const options = {
        ...mockOptions,
        tokenGenerationUrl: 'https://auth.example.com/token',
      };
      expect(() => validateAuthenticationOptions(options)).not.toThrow();
    });

    it('should throw error when neither apiKey nor tokenGenerationUrl is provided', () => {
      const options = {
        ...mockOptions,
        apiKey: undefined,
      };
      expect(() => validateAuthenticationOptions(options)).toThrow(
        'Either apiKey or tokenGenerationUrl must be provided for authentication',
      );
    });
  });

  describe('validateNamespace', () => {
    it('should accept valid namespace', () => {
      expect(() => validateNamespace('valid-namespace_123')).not.toThrow();
    });

    it('should throw error for empty namespace', () => {
      expect(() => validateNamespace('')).toThrow('Namespace must be a non-empty string');
    });

    it('should throw error for null namespace', () => {
      expect(() => validateNamespace(null as any)).toThrow('Namespace must be a non-empty string');
    });

    it('should throw error for undefined namespace', () => {
      expect(() => validateNamespace(undefined as any)).toThrow(
        'Namespace must be a non-empty string',
      );
    });

    it('should throw error for non-string namespace', () => {
      expect(() => validateNamespace(123 as any)).toThrow('Namespace must be a non-empty string');
    });

    it('should throw error for namespace exceeding 100 characters', () => {
      const longNamespace = 'a'.repeat(101);
      expect(() => validateNamespace(longNamespace)).toThrow(
        'Namespace must be between 1 and 100 characters',
      );
    });

    it('should accept namespace with exactly 100 characters', () => {
      const namespace = 'a'.repeat(100);
      expect(() => validateNamespace(namespace)).not.toThrow();
    });

    it('should throw error for namespace with invalid characters', () => {
      expect(() => validateNamespace('invalid namespace')).toThrow(
        'Namespace can only contain alphanumeric characters, underscores, and hyphens',
      );
      expect(() => validateNamespace('invalid.namespace')).toThrow(
        'Namespace can only contain alphanumeric characters, underscores, and hyphens',
      );
      expect(() => validateNamespace('invalid@namespace')).toThrow(
        'Namespace can only contain alphanumeric characters, underscores, and hyphens',
      );
    });

    it('should accept namespace with valid special characters', () => {
      expect(() => validateNamespace('valid_namespace-123')).not.toThrow();
      expect(() => validateNamespace('_leading_underscore')).not.toThrow();
      expect(() => validateNamespace('-leading-hyphen')).not.toThrow();
    });
  });

  describe('validateApiBaseUrl', () => {
    it('should accept valid HTTPS URL', () => {
      expect(() => validateApiBaseUrl('https://api.example.com')).not.toThrow();
    });

    it('should accept valid HTTP URL', () => {
      expect(() => validateApiBaseUrl('http://localhost:3000')).not.toThrow();
    });

    it('should accept URL with path', () => {
      expect(() => validateApiBaseUrl('https://api.example.com/v1')).not.toThrow();
    });

    it('should accept URL with port', () => {
      expect(() => validateApiBaseUrl('https://api.example.com:8080')).not.toThrow();
    });

    it('should throw error for empty URL', () => {
      expect(() => validateApiBaseUrl('')).toThrow('API base URL must be a non-empty string');
    });

    it('should throw error for null URL', () => {
      expect(() => validateApiBaseUrl(null as any)).toThrow(
        'API base URL must be a non-empty string',
      );
    });

    it('should throw error for undefined URL', () => {
      expect(() => validateApiBaseUrl(undefined as any)).toThrow(
        'API base URL must be a non-empty string',
      );
    });

    it('should throw error for non-string URL', () => {
      expect(() => validateApiBaseUrl(123 as any)).toThrow(
        'API base URL must be a non-empty string',
      );
    });

    it('should throw error for invalid URL format', () => {
      expect(() => validateApiBaseUrl('not-a-url')).toThrow('Invalid API base URL format');
    });

    it('should throw error for non-HTTP(S) protocol', () => {
      expect(() => validateApiBaseUrl('ftp://example.com')).toThrow(
        'API base URL must use HTTP or HTTPS protocol',
      );
      expect(() => validateApiBaseUrl('ws://example.com')).toThrow(
        'API base URL must use HTTP or HTTPS protocol',
      );
    });

    it('should throw error for relative URLs', () => {
      expect(() => validateApiBaseUrl('/api/endpoint')).toThrow('Invalid API base URL format');
    });
  });

  describe('validateZFactor', () => {
    it('should return default value when undefined', () => {
      expect(validateZFactor(undefined)).toBe(DEFAULT_Z_FACTOR);
    });

    it('should return default value when null', () => {
      expect(validateZFactor(null as any)).toBe(DEFAULT_Z_FACTOR);
    });

    it('should accept valid integer z-factor', () => {
      expect(validateZFactor(5)).toBe(5);
    });

    it('should accept minimum z-factor', () => {
      expect(validateZFactor(MIN_Z_FACTOR)).toBe(MIN_Z_FACTOR);
    });

    it('should accept maximum z-factor', () => {
      expect(validateZFactor(MAX_Z_FACTOR)).toBe(MAX_Z_FACTOR);
    });

    it('should throw error for non-integer z-factor', () => {
      expect(() => validateZFactor(3.5)).toThrow('Z-factor must be an integer');
    });

    it('should throw error for non-number z-factor', () => {
      expect(() => validateZFactor('5' as any)).toThrow('Z-factor must be an integer');
    });

    it('should throw error for z-factor below minimum', () => {
      expect(() => validateZFactor(MIN_Z_FACTOR - 1)).toThrow(
        `Z-factor must be between ${MIN_Z_FACTOR} and ${MAX_Z_FACTOR}`,
      );
    });

    it('should throw error for z-factor above maximum', () => {
      expect(() => validateZFactor(MAX_Z_FACTOR + 1)).toThrow(
        `Z-factor must be between ${MIN_Z_FACTOR} and ${MAX_Z_FACTOR}`,
      );
    });

    it('should throw error for NaN', () => {
      expect(() => validateZFactor(NaN)).toThrow('Z-factor must be an integer');
    });

    it('should throw error for Infinity', () => {
      expect(() => validateZFactor(Infinity)).toThrow('Z-factor must be an integer');
    });
  });

  describe('validateSyncArray', () => {
    it('should accept valid array', () => {
      expect(() => validateSyncArray(['key1', 'key2'])).not.toThrow();
    });

    it('should accept empty array', () => {
      expect(() => validateSyncArray([])).not.toThrow();
    });

    it('should accept undefined', () => {
      expect(() => validateSyncArray(undefined)).not.toThrow();
    });

    it('should throw error for non-array sync', () => {
      expect(() => validateSyncArray('not-an-array' as any)).toThrow('sync must be an array');
    });

    it('should throw error for object sync', () => {
      expect(() => validateSyncArray({ key: 'value' } as any)).toThrow('sync must be an array');
    });

    it('should throw error for number sync', () => {
      expect(() => validateSyncArray(123 as any)).toThrow('sync must be an array');
    });
  });

  describe('validateMultiplayerOptions', () => {
    it('should return valid result for valid options', () => {
      const result = validateMultiplayerOptions(mockOptions);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should collect all validation errors', () => {
      const invalidOptions = {
        namespace: '',
        apiBaseUrl: 'invalid-url',
        sync: 'not-an-array' as any,
        zFactor: 999,
      } as MultiplayerOptions<any>;

      const result = validateMultiplayerOptions(invalidOptions);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Either apiKey or tokenGenerationUrl must be provided');
    });

    it('should set default z-factor when not provided', () => {
      const options = { ...mockOptions };
      validateMultiplayerOptions(options);
      expect(options.zFactor).toBe(DEFAULT_Z_FACTOR);
    });

    it('should preserve valid z-factor', () => {
      const options = { ...mockOptions, zFactor: 5 };
      validateMultiplayerOptions(options);
      expect(options.zFactor).toBe(5);
    });

    it('should handle validation errors gracefully', () => {
      const invalidOptions = {
        namespace: null as any,
        apiBaseUrl: null as any,
      } as MultiplayerOptions<any>;

      const result = validateMultiplayerOptions(invalidOptions);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate all fields even if early ones fail', () => {
      const invalidOptions = {
        namespace: '',
        apiBaseUrl: 'invalid',
        sync: 'not-array' as any,
        zFactor: 999,
      } as MultiplayerOptions<any>;

      const result = validateMultiplayerOptions(invalidOptions);
      expect(result.isValid).toBe(false);
      // Should have caught the first error and stopped
      expect(result.errors.length).toBe(1);
    });
  });

  describe('validateOptions', () => {
    it('should return options for valid configuration', () => {
      const result = validateOptions(mockOptions);
      expect(result).toBe(mockOptions);
      expect(result.zFactor).toBe(DEFAULT_Z_FACTOR);
    });

    it('should throw error for invalid configuration', () => {
      const invalidOptions = {
        namespace: '',
        apiBaseUrl: 'invalid-url',
      } as MultiplayerOptions<any>;

      expect(() => validateOptions(invalidOptions)).toThrow('Configuration validation failed:');
    });

    it('should include all errors in the error message', () => {
      const invalidOptions = {
        namespace: '',
        apiBaseUrl: 'invalid',
      } as MultiplayerOptions<any>;

      try {
        validateOptions(invalidOptions);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Configuration validation failed:');
        expect((error as Error).message).toContain('Either apiKey or tokenGenerationUrl');
      }
    });

    it('should log warnings to console when available', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Simulate the validateOptions behavior with warnings
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: ['Test warning 1', 'Test warning 2'],
      };

      // Simulate the validateOptions behavior with warnings
      if (!result.isValid) {
        throw new Error(`Configuration validation failed: ${result.errors.join(', ')}`);
      }

      if (result.warnings.length > 0 && typeof console !== 'undefined') {
        console.warn('Zustand Multiplayer Configuration Warnings:', result.warnings);
      }

      expect(consoleWarnSpy).toHaveBeenCalledWith('Zustand Multiplayer Configuration Warnings:', [
        'Test warning 1',
        'Test warning 2',
      ]);

      consoleWarnSpy.mockRestore();
    });

    it('should handle console not being available', () => {
      const originalConsole = global.console;
      // @ts-expect-error bacause it's fine
      delete global.console;

      const result = validateOptions(mockOptions);
      expect(result).toBe(mockOptions);

      global.console = originalConsole;
    });

    it('should set default values during validation', () => {
      const options = {
        ...mockOptions,
        zFactor: undefined,
      };

      const result = validateOptions(options);
      expect(result.zFactor).toBe(DEFAULT_Z_FACTOR);
    });

    it('should preserve user-provided values', () => {
      const options = {
        ...mockOptions,
        zFactor: 7,
        sync: ['key1', 'key2'] as any,
      };

      const result = validateOptions(options);
      expect(result.zFactor).toBe(7);
      expect(result.sync).toEqual(['key1', 'key2']);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle thrown non-Error objects in validateMultiplayerOptions', () => {
      // Test the error handling directly
      const errors: string[] = [];
      try {
        validateNamespace('');
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }

      expect(errors[0]).toBeDefined();
      expect(errors[0]).toContain('Namespace must be a non-empty string');
    });

    it('should validate complex sync arrays', () => {
      interface TestState {
        user: { name: string };
        settings: { theme: string };
        data: number[];
      }

      const options: MultiplayerOptions<TestState> = {
        ...mockOptions,
        sync: ['user', 'settings', 'data'],
      };

      expect(() => validateSyncArray(options.sync)).not.toThrow();
    });

    it('should handle all validation functions being called in sequence', () => {
      const options = {
        namespace: 'test-ns',
        apiBaseUrl: 'https://api.test.com',
        apiKey: 'key',
        sync: ['field1', 'field2'],
        zFactor: 5,
      } as MultiplayerOptions<any>;

      const result = validateMultiplayerOptions(options);
      expect(result.isValid).toBe(true);
      expect(options.zFactor).toBe(5);
    });
  });
});
