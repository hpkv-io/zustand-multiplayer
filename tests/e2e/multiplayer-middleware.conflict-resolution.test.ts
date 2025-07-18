import { describe, it, expect, vi, afterAll } from 'vitest';
import { createUniqueStoreName, waitFor } from '../utils/test-utils';
import { MockHPKVClientFactory, MockTokenHelper, MockWebsocketTokenManager } from '../mocks';
import { ImmerStateCreator, MultiplayerOptions } from '../../src/types/multiplayer-types';

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

vi.doMock('../../src/auth/token-helper', () => {
  return {
    TokenHelper: MockTokenHelper,
  };
});

const { StoreCreator } = await import('../utils/store-creator');

type TestState = {
  count: number;
  text: string;
  increment: () => void;
  setText: (text: string) => void;
};

const initializer: ImmerStateCreator<TestState, [['zustand/multiplayer', unknown]], []> = set => ({
  count: 0,
  text: '',
  increment: () => set(state => ({ count: state.count + 1 })),
  setText: (text: string) => set({ text }),
});

const storeCreator = new StoreCreator();
function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, options);
}

describe('Multiplayer Middleware Conflict Resolution Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  it('should resolve conflicts using keep-remote strategy', async () => {
    const namespace = createUniqueStoreName('default-subscription-test');
    const store1 = createTestStore({ namespace });
    const store2 = createTestStore({
      namespace,
      onConflict: conflicts => {
        return { strategy: 'keep-remote' };
      },
    });
    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      expect(store2.getState().multiplayer.hasHydrated).toBe(true);
    });

    await store2.getState().multiplayer.disconnect();

    store1.getState().setText('Set by Store 1');

    store2.getState().setText('Set by Store 2');

    await waitFor(() => {
      expect(store1.getState().text).toBe('Set by Store 1');
      expect(store2.getState().text).toBe('Set by Store 1');
    });
  });

  it('should resolve conflicts using keep-local strategy', async () => {
    const namespace = createUniqueStoreName('default-subscription-test');
    const store1 = createTestStore({ namespace });
    const store2 = createTestStore({
      namespace,
      onConflict: conflicts => {
        return { strategy: 'keep-local' };
      },
    });
    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      expect(store2.getState().multiplayer.hasHydrated).toBe(true);
    });

    await store2.getState().multiplayer.disconnect();

    store1.getState().setText('Set by Store 1');
    await new Promise(resolve => setTimeout(resolve, 100));

    store2.getState().setText('Set by Store 2');

    await waitFor(() => {
      expect(store1.getState().text).toBe('Set by Store 2');
      expect(store2.getState().text).toBe('Set by Store 2');
    });
  });

  it('should resolve conflicts using merge strategy', async () => {
    const namespace = createUniqueStoreName('default-subscription-test');
    const store1 = createTestStore({ namespace });
    const store2 = createTestStore({
      namespace,
      onConflict: conflicts => {
        return {
          strategy: 'merge',
          mergedValues: { text: conflicts[0].remoteValue + ' - ' + conflicts[0].pendingValue },
        };
      },
    });
    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      expect(store2.getState().multiplayer.hasHydrated).toBe(true);
    });

    await store2.getState().multiplayer.disconnect();

    store1.getState().setText('Set by Store 1');

    store2.getState().setText('Set by Store 2');

    await waitFor(() => {
      expect(store1.getState().text).toBe('Set by Store 1 - Set by Store 2');
      expect(store2.getState().text).toBe('Set by Store 1 - Set by Store 2');
    });
  });
});
