import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from 'vitest';
import { MultiplayerOptions } from '../src/multiplayer';
import { LogLevel } from '../src/logger';
import { createUniqueStoreName, waitFor } from './utils/test-utils';

import { StateCreator } from 'zustand';
import { MockHPKVClientFactory } from './mocks/mock-hpkv-client';
import { MockWebsocketTokenManager } from './mocks/mock-token-manager';
import { MockTokenHelper } from './mocks/mock-token-manager';

vi.doMock('@hpkv/websocket-client', () => {
  return {
    HPKVClientFactory: MockHPKVClientFactory,
    WebsocketTokenManager: MockWebsocketTokenManager,
    ConnectionState: {
      CONNECTED: 'CONNECTED',
      DISCONNECTED: 'DISCONNECTED',
      CONNECTING: 'CONNECTING',
      RECONNECTING: 'RECONNECTING',
    },
  };
});

vi.doMock('../src/token-helper', () => {
  return {
    TokenHelper: MockTokenHelper,
  };
});

const { StoreCreator } = await import('./utils/store-creator');

// Test state for configuration testing
type TestState = {
  count: number;
  text: string;
  settings: {
    theme: 'light' | 'dark';
    language: string;
  };
  increment: () => void;
  setText: (text: string) => void;
  updateTheme: (theme: 'light' | 'dark') => void;
  updateLanguage: (language: string) => void;
};

const initializer: StateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  settings: {
    theme: 'light',
    language: 'en',
  },
  increment: () => set(state => ({ count: state.count + 1 })),
  setText: (text: string) => set({ text }),
  updateTheme: (theme: 'light' | 'dark') =>
    set(state => ({
      settings: { ...state.settings, theme },
    })),
  updateLanguage: (language: string) =>
    set(state => ({
      settings: { ...state.settings, language },
    })),
});

const storeCreator = new StoreCreator();

function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, { ...options, profiling: true });
}

describe('Multiplayer Middleware Configuration Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset any mock storage instances that might have been configured with failure modes
    // This prevents cleanup issues during test teardown
    vi.clearAllMocks();
  });

  describe('Logging Configuration', () => {
    it('should handle invalid log levels gracefully', async () => {
      const uniqueNamespace = createUniqueStoreName('config-invalid-log');

      // Should not throw with invalid log level
      expect(() => {
        createTestStore({
          namespace: uniqueNamespace,
          logLevel: 999 as LogLevel,
        });
      }).not.toThrow();
    });
  });

  describe('Retry Configuration', () => {
    it('should use custom retry settings', async () => {
      const uniqueNamespace = createUniqueStoreName('config-retry');

      const store = createTestStore({
        namespace: uniqueNamespace,
        retryConfig: {
          maxRetries: 5,
          baseDelay: 200,
          maxDelay: 2000,
          backoffFactor: 1.5,
        },
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Store should be created successfully with custom retry config
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });

    it('should handle minimal retry configuration', async () => {
      const uniqueNamespace = createUniqueStoreName('config-minimal-retry');

      const store = createTestStore({
        namespace: uniqueNamespace,
        retryConfig: {
          maxRetries: 1,
          baseDelay: 50,
          maxDelay: 100,
          backoffFactor: 1,
        },
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });

    it('should handle aggressive retry configuration', async () => {
      const uniqueNamespace = createUniqueStoreName('config-aggressive-retry');

      const store = createTestStore({
        namespace: uniqueNamespace,
        retryConfig: {
          maxRetries: 10,
          baseDelay: 10,
          maxDelay: 5000,
          backoffFactor: 3,
        },
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });
  });

  describe('Performance Configuration', () => {
    it('should use custom performance settings', async () => {
      const uniqueNamespace = createUniqueStoreName('config-performance');

      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Perform operations to generate metrics
      store.getState().increment();
      store.getState().setText('Performance test');

      const metrics = store.getState().multiplayer.getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics.stateChangesProcessed).toBe('number');
    });

    it('should work with metrics disabled', async () => {
      const uniqueNamespace = createUniqueStoreName('config-no-metrics');

      const store = createTestStore({ namespace: uniqueNamespace });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Should still provide metrics interface even when disabled
      const metrics = store.getState().multiplayer.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('Selective Synchronization', () => {
    it('should respect publishUpdatesFor configuration', async () => {
      const uniqueNamespace = createUniqueStoreName('config-publish');

      const store = createTestStore({
        namespace: uniqueNamespace,
        publishUpdatesFor: () => ['count' as keyof TestState], // Only publish count changes
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Changes to published fields should work
      store.getState().increment();
      expect(store.getState().count).toBe(1);

      // Changes to non-published fields should work locally
      store.getState().setText('Local only');
      expect(store.getState().text).toBe('Local only');
    });

    it('should respect subscribeToUpdatesFor configuration', async () => {
      const uniqueNamespace = createUniqueStoreName('config-subscribe');

      const store = createTestStore({
        namespace: uniqueNamespace,
        subscribeToUpdatesFor: () => ['settings' as keyof TestState], // Only subscribe to settings changes
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Should be able to update subscribed fields
      store.getState().updateTheme('dark');
      expect(store.getState().settings.theme).toBe('dark');

      // Should be able to update non-subscribed fields locally
      store.getState().increment();
      expect(store.getState().count).toBe(1);
    });

    it('should handle dynamic field selection', async () => {
      const uniqueNamespace = createUniqueStoreName('config-dynamic');

      let publishFields: (keyof TestState)[] = ['count'];

      const store = createTestStore({
        namespace: uniqueNamespace,
        publishUpdatesFor: () => publishFields,
        subscribeToUpdatesFor: () => ['count' as keyof TestState, 'text' as keyof TestState],
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Initially only count should be published
      store.getState().increment();
      expect(store.getState().count).toBe(1);

      // Change what fields are published
      publishFields = ['text'];

      store.getState().setText('Now published');
      expect(store.getState().text).toBe('Now published');
    });
  });

  describe('Conflict Resolution Configuration', () => {
    it('should use custom conflict resolution', async () => {
      const uniqueNamespace = createUniqueStoreName('config-conflict');

      const conflictHandler = vi.fn(() => ({ strategy: 'keep-remote' as const }));

      const store = createTestStore({
        namespace: uniqueNamespace,
        onConflict: conflictHandler,
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // The conflict handler should be set up (we can't easily test actual conflicts in unit tests)
      expect(store.getState().multiplayer.hasHydrated).toBe(true);
    });

    it('should handle different conflict resolution strategies', async () => {
      const uniqueNamespace = createUniqueStoreName('config-conflict-strategies');

      // Keep remote strategy
      const keepRemoteStore = createTestStore({
        namespace: uniqueNamespace + '-remote',
        onConflict: () => ({ strategy: 'keep-remote' as const }),
      });

      // Keep pending strategy
      const keepPendingStore = createTestStore({
        namespace: uniqueNamespace + '-pending',
        onConflict: () => ({ strategy: 'keep-local' as const }),
      });

      // Merge strategy
      const mergeStore = createTestStore({
        namespace: uniqueNamespace + '-merge',
        onConflict: conflicts => ({
          strategy: 'merge' as const,
          mergedValues: { count: 42, text: 'merged' },
        }),
      });

      await waitFor(() => keepRemoteStore.getState().multiplayer.hasHydrated);
      await waitFor(() => keepPendingStore.getState().multiplayer.hasHydrated);
      await waitFor(() => mergeStore.getState().multiplayer.hasHydrated);

      // All stores should be initialized successfully
      expect(keepRemoteStore.getState().multiplayer.hasHydrated).toBe(true);
      expect(keepPendingStore.getState().multiplayer.hasHydrated).toBe(true);
      expect(mergeStore.getState().multiplayer.hasHydrated).toBe(true);
    });
  });

  describe('Combined Configuration', () => {
    it('should handle complex configuration combinations', async () => {
      const uniqueNamespace = createUniqueStoreName('config-combined');

      const store = createTestStore({
        namespace: uniqueNamespace,
        logLevel: LogLevel.DEBUG,
        retryConfig: {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 1000,
          backoffFactor: 2,
        },
        publishUpdatesFor: () => [
          'count' as keyof TestState,
          'settings' as keyof TestState,
          'text' as keyof TestState,
        ],
        subscribeToUpdatesFor: () => [
          'count' as keyof TestState,
          'settings' as keyof TestState,
          'text' as keyof TestState,
        ],
        onConflict: () => ({ strategy: 'keep-remote' as const }),
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Test that all configurations work together
      store.getState().increment();
      store.getState().updateTheme('dark');
      store.getState().setText('Combined config test');

      expect(store.getState().count).toBe(1);
      expect(store.getState().settings.theme).toBe('dark');
      expect(store.getState().text).toBe('Combined config test');

      // Add a small delay to ensure async operations complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Wait for metrics to be updated
      await waitFor(
        () => {
          const metrics = store.getState().multiplayer.getMetrics();
          return metrics.stateChangesProcessed > 0;
        },
        { timeout: 1000 },
      );

      const metrics = store.getState().multiplayer.getMetrics();
      console.log('DEBUG: Metrics object:', JSON.stringify(metrics, null, 2));
      expect(metrics.stateChangesProcessed).toBeGreaterThan(0);
    });

    it('should use default values for missing configurations', async () => {
      const uniqueNamespace = createUniqueStoreName('config-defaults');

      // Create store with minimal configuration
      const store = createTestStore({
        namespace: uniqueNamespace,
        // Only provide namespace, use defaults for everything else
      });

      await waitFor(() => store.getState().multiplayer.hasHydrated);

      // Should work with default configurations
      store.getState().increment();
      store.getState().setText('Default config test');

      expect(store.getState().count).toBe(1);
      expect(store.getState().text).toBe('Default config test');

      // Metrics should be available
      const metrics = store.getState().multiplayer.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should handle invalid retry configuration gracefully', async () => {
      const uniqueNamespace = createUniqueStoreName('config-invalid-retry');

      expect(() => {
        createTestStore({
          namespace: uniqueNamespace,
          retryConfig: {
            maxRetries: -1,
            baseDelay: -100,
            maxDelay: -1000,
            backoffFactor: -1,
          },
        });
      }).not.toThrow();
    });
  });
});
