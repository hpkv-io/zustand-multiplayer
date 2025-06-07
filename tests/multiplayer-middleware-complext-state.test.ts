import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from 'vitest';
import { StateCreator } from 'zustand';
import { MultiplayerOptions } from '../src/multiplayer';
import { createUniqueStoreName, waitFor } from './utils/test-utils';
import { MockTokenHelper } from './mocks/mock-token-manager';
import { MockWebsocketTokenManager } from './mocks/mock-token-manager';
import { MockHPKVClientFactory } from './mocks/mock-hpkv-client';

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

interface ComplexState {
  items: Array<{
    id: string;
    name: string;
    completed: boolean;
  }>;
  settings: {
    theme: 'light' | 'dark';
    notifications: {
      enabled: boolean;
      frequency: number;
    };
  };
  lastUpdated: string;
  addItem: (name: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
  updateSettings: (settings: Partial<ComplexState['settings']>) => void;
  updateTheme: (theme: 'light' | 'dark') => void;
  updateNotifications: (enabled: boolean, frequency?: number) => void;
}

const initializer: StateCreator<ComplexState, [['zustand/multiplayer', unknown]], []> = set => ({
  items: [],
  settings: {
    theme: 'light',
    notifications: {
      enabled: true,
      frequency: 15,
    },
  },
  lastUpdated: new Date().toISOString(),
  addItem: (name: string) =>
    set(state => ({
      items: [
        ...state.items,
        {
          id: `${Math.random().toString(36).substring(2, 15)}`,
          name,
          completed: false,
        },
      ],
      lastUpdated: new Date().toISOString(),
    })),
  removeItem: (id: string) =>
    set(state => ({
      items: [...state.items.filter(item => item.id !== id)],
      lastUpdated: new Date().toISOString(),
    })),
  toggleItem: (id: string) =>
    set(state => ({
      items: state.items.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
      lastUpdated: new Date().toISOString(),
    })),
  updateSettings: newSettings =>
    set(state => ({
      settings: {
        ...state.settings,
        ...newSettings,
      },
      lastUpdated: new Date().toISOString(),
    })),
  updateTheme: theme =>
    set(state => ({
      settings: {
        ...state.settings,
        theme,
      },
      lastUpdated: new Date().toISOString(),
    })),
  updateNotifications: (enabled, frequency) =>
    set(state => ({
      settings: {
        ...state.settings,
        notifications: {
          ...state.settings.notifications,
          enabled,
          ...(frequency !== undefined ? { frequency } : {}),
        },
      },
      lastUpdated: new Date().toISOString(),
    })),
});

const storeCreator = new StoreCreator();

function createTestStore(options?: Partial<MultiplayerOptions<ComplexState>>) {
  return storeCreator.createStore<ComplexState>(initializer, options);
}

describe('Multiplayer Middleware Complex State Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  it('should synchronize array operations (add/remove items)', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });

    store1.getState().addItem('Task 1');
    store1.getState().addItem('Task 2');
    await waitFor(() => {
      expect(store2.getState().items.length).toBe(2);
      expect(store2.getState().items[0].name).toBe('Task 1');
      expect(store2.getState().items[1].name).toBe('Task 2');
    });

    const itemId = store2.getState().items[0].id;
    store2.getState().removeItem(itemId);
    await waitFor(() => {
      expect(store1.getState().items.length).toBe(1);
      expect(store1.getState().items[0].name).toBe('Task 2');
    });
  });

  it('should synchronize nested object updates', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });
    // Update theme in store 1
    store1.getState().updateTheme('dark');

    // Wait for synchronization
    await waitFor(
      () => {
        return store2.getState().settings.theme === 'dark';
      },
      { timeout: 1000 },
    );

    // Update deep nested settings in store 2
    store2.getState().updateNotifications(false, 30);

    // Wait for synchronization
    await waitFor(
      () => {
        const notifications = store1.getState().settings.notifications;
        return notifications.enabled === false && notifications.frequency === 30;
      },
      { timeout: 1000 },
    );
  });

  it('should handle complex state operations', async () => {
    const uniqueNamespace = createUniqueStoreName('namespace');
    const store1 = createTestStore({ namespace: uniqueNamespace });
    const store2 = createTestStore({ namespace: uniqueNamespace });
    await waitFor(() => {
      expect(store1.getState().multiplayer.hasHydrated).toBe(true);
      expect(store2.getState().multiplayer.hasHydrated).toBe(true);
    });

    // Perform a series of operations in store 1
    store1.getState().addItem('Task 1');
    await new Promise(resolve => setTimeout(resolve, 100));
    store1.getState().addItem('Task 2');
    await new Promise(resolve => setTimeout(resolve, 100));
    store1.getState().addItem('Task 3');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Wait for synchronization
    await waitFor(() => {
      expect(store2.getState().items.length).toBe(3);
    });

    // Toggle an item in store 2
    const itemId = store2.getState().items[1].id;
    store2.getState().toggleItem(itemId);

    // Wait for toggle to synchronize
    await waitFor(() => {
      expect(store1.getState().items[1].completed).toBe(true);
    });

    // Update multiple settings at once in store 1
    store1.getState().updateSettings({
      theme: 'dark',
      notifications: {
        enabled: false,
        frequency: 60,
      },
    });

    // Wait for complex settings update to synchronize
    await waitFor(() => {
      expect(store2.getState().settings.theme).toBe('dark');
      expect(store2.getState().settings.notifications.enabled).toBe(false);
      expect(store2.getState().settings.notifications.frequency).toBe(60);
    });
  });
});
