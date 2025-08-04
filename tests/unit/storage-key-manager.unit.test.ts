import { describe, expect, it } from 'vitest';
import { StorageKeyManager } from '../../src/storage/storage-key-manager';

describe('StorageKeyManager Unit Tests', () => {
  it('should create different keys for same namespace with different zFactor', () => {
    const namespace = 'test-app';
    const path = ['user', 'profile'];

    const manager1 = new StorageKeyManager(namespace);
    const manager2 = new StorageKeyManager(namespace, 2);
    const manager3 = new StorageKeyManager(namespace, 5);

    const key1 = manager1.createStorageKey(path);
    const key2 = manager2.createStorageKey(path);
    const key3 = manager3.createStorageKey(path);

    expect(key1).toBe('test-app:user:profile');
    expect(key2).toBe('test-app-2:user:profile');
    expect(key3).toBe('test-app-5:user:profile');

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key2).not.toBe(key3);
  });

  it('should handle zFactor in namespace ranges', () => {
    const namespace = 'my-store';

    const manager1 = new StorageKeyManager(namespace);
    const manager2 = new StorageKeyManager(namespace, 3);

    const range1 = manager1.getNamespaceRange();
    const range2 = manager2.getNamespaceRange();

    expect(range1.start).toBe('my-store:');
    expect(range1.end).toBe('my-store:\xff');

    expect(range2.start).toBe('my-store-3:');
    expect(range2.end).toBe('my-store-3:\xff');
  });

  it('should handle zFactor in getFullKey method', () => {
    const namespace = 'app';

    const manager1 = new StorageKeyManager(namespace);
    const manager2 = new StorageKeyManager(namespace, 7);

    const key1 = manager1.getFullKey('settings');
    const key2 = manager2.getFullKey('settings');

    expect(key1).toBe('app:settings');
    expect(key2).toBe('app-7:settings');
  });

  it('should handle zFactor 0 correctly', () => {
    const namespace = 'store';
    const manager = new StorageKeyManager(namespace, 0);

    const key = manager.createStorageKey(['data']);
    expect(key).toBe('store-0:data');
  });

  it('should treat undefined zFactor same as no zFactor', () => {
    const namespace = 'store';
    const manager1 = new StorageKeyManager(namespace);
    const manager2 = new StorageKeyManager(namespace, undefined);

    const key1 = manager1.createStorageKey(['data']);
    const key2 = manager2.createStorageKey(['data']);

    expect(key1).toBe(key2);
    expect(key1).toBe('store:data');
  });

  it('should return namespaced prefix for getNamespace()', () => {
    const namespace = 'app';

    const manager1 = new StorageKeyManager(namespace);
    const manager2 = new StorageKeyManager(namespace, 8);

    expect(manager1.getNamespace()).toBe('app');
    expect(manager2.getNamespace()).toBe('app-8');
  });
});
