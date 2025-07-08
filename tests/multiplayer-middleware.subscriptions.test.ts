import { describe, it, expect, vi, afterAll } from 'vitest';
import { StateCreator } from 'zustand';
import { createUniqueStoreName, waitFor } from './utils/test-utils';
import { MockHPKVClientFactory, MockTokenHelper, MockWebsocketTokenManager } from './mocks';
import { ImmerStateCreator, MultiplayerOptions } from '../src/types/multiplayer-types';

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

vi.doMock('../src/auth/token-helper', () => {
  return {
    TokenHelper: MockTokenHelper,
  };
});

const { StoreCreator } = await import('./utils/store-creator');

type TestState = {
  count: number;
  text: string;
  increment: () => void;
  setText: (text: string) => void;
};

const initializer: ImmerStateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  nested: { value: 0 },
  increment: () => set(state => ({ count: state.count + 1 })),
  setText: (text: string) => set({ text }),
});

const storeCreator = new StoreCreator();
function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, options);
}

describe('Multiplayer Middleware Subscription Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  it('should subscribe to all state changes by default', async () => {
    const namespace = createUniqueStoreName('default-subscription-test');
    const store1 = createTestStore({ namespace });
    const store2 = createTestStore({ namespace });
    store1.getState().increment();
    store2.getState().setText('Text');
    await waitFor(() => {
      expect(store1.getState().count).toBe(1);
      expect(store1.getState().text).toBe('Text');
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Text');
    });
  });

  it('should only subscribe to confgured state keys when configured', async () => {
    const namespace = createUniqueStoreName('configured-subscription-test');
    const store1 = createTestStore({ namespace, subscribeToUpdatesFor: () => ['text'] });
    const store2 = createTestStore({ namespace, subscribeToUpdatesFor: () => ['count'] });
    store1.getState().increment();
    store1.getState().setText('Text');
    await waitFor(() => {
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('');
    });

    store2.getState().increment();
    store2.getState().setText('Text');
    await waitFor(() => {
      expect(store2.getState().count).toBe(2);
      expect(store1.getState().count).toBe(1);
      expect(store1.getState().text).toBe('Text');
    });
  });

  it('should publish all state changes by default', async () => {
    const namespace = createUniqueStoreName('publish-default-subscription-test');
    const store1 = createTestStore({ namespace });
    const store2 = createTestStore({ namespace });
    store1.getState().increment();
    store2.getState().setText('Text');
    await waitFor(() => {
      expect(store1.getState().count).toBe(1);
      expect(store1.getState().text).toBe('Text');
      expect(store2.getState().count).toBe(1);
      expect(store2.getState().text).toBe('Text');
    });
  });

  it('should only publish configured state changes when configured', async () => {
    const namespace = createUniqueStoreName('publish-configured-subscription-test');
    const store1 = createTestStore({ namespace, publishUpdatesFor: () => ['text'] });
    const store2 = createTestStore({ namespace });
    store1.getState().increment();
    store1.getState().setText('Text');
    await waitFor(() => {
      expect(store1.getState().count).toBe(1);
      expect(store1.getState().text).toBe('Text');
      expect(store2.getState().count).toBe(0);
      expect(store2.getState().text).toBe('Text');
    });
  });

  it('should not persist state changes for non-published state keys', async () => {
    const namespace = createUniqueStoreName('publish-not-configured-subscription-test');
    const store1 = createTestStore({ namespace, publishUpdatesFor: () => ['text'] });

    store1.getState().increment();
    store1.getState().setText('Text');
    await new Promise(resolve => setTimeout(resolve, 100));

    const store2 = createTestStore({ namespace });
    await waitFor(() => {
      expect(store2.getState().count).toBe(0);
      expect(store2.getState().text).toBe('Text');
    });
  });
});
