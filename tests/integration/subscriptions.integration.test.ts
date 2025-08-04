import { describe, it, expect, afterAll } from 'vitest';
import type { StateCreator } from 'zustand';
import type { MultiplayerOptions } from '../../src/types/multiplayer-types';
import { createUniqueStoreName, waitFor } from '../utils/test-utils';
import { StoreCreator } from '../utils/store-creator';

interface TestState {
  count: number;
  text: string;
  nested: {
    levelOne: {
      levelTwo: {
        levelThree: {
          value: string;
        };
      };
    };
  };
  records: Record<string, { value: string }>;
  nestedRecords: {
    records: Record<string, { value: string }>;
  };
  increment: () => void;
  setText: (text: string) => void;
  updateNested: (value: string) => void;
  addRecord: (key: string, value: string) => void;
  removeRecord: (key: string) => void;
  updateRecord: (key: string, value: string) => void;
  addNestedRecord: (key: string, value: string) => void;
  removeNestedRecord: (key: string) => void;
  updateNestedRecord: (key: string, value: string) => void;
}

const initializer: StateCreator<TestState, [], []> = set => ({
  count: 0,
  text: '',
  nested: {
    levelOne: {
      levelTwo: {
        levelThree: {
          value: '',
        },
      },
    },
  },
  records: {},
  nestedRecords: {
    records: {},
  },
  increment: () => set(state => ({ count: state.count + 1 })),
  setText: (text: string) => set({ text }),
  updateNested: (value: string) =>
    set({ nested: { levelOne: { levelTwo: { levelThree: { value } } } } }),
  addRecord: (key: string, value: string) =>
    set(state => ({ records: { ...state.records, [key]: { value } } })),
  removeRecord: (key: string) =>
    set(state => ({
      records: Object.fromEntries(Object.entries(state.records).filter(([k]) => k !== key)),
    })),
  updateRecord: (key: string, value: string) =>
    set(state => ({ records: { ...state.records, [key]: { value } } })),
  addNestedRecord: (key: string, value: string) =>
    set(state => ({
      nestedRecords: { records: { ...state.nestedRecords.records, [key]: { value } } },
    })),
  removeNestedRecord: (key: string) =>
    set(state => ({
      nestedRecords: {
        records: Object.fromEntries(
          Object.entries(state.nestedRecords.records).filter(([k]) => k !== key),
        ),
      },
    })),
  updateNestedRecord: (key: string, value: string) =>
    set(state => ({
      nestedRecords: { records: { ...state.nestedRecords.records, [key]: { value } } },
    })),
});

const skip = !process.env.HPKV_API_KEY || !process.env.HPKV_API_BASE_URL;
const storeCreator = new StoreCreator();
function createTestStore(
  options?: Partial<MultiplayerOptions<TestState>> | MultiplayerOptions<TestState>,
) {
  return storeCreator.createStore<TestState>(initializer, {
    apiKey: process.env.HPKV_API_KEY,
    apiBaseUrl: process.env.HPKV_API_BASE_URL,
    ...options,
  });
}

describe('Multiplayer Middleware Subscription Tests', () => {
  afterAll(async () => {
    await storeCreator.cleanupAllStores();
  });

  describe('Selective synchronization tests', () => {
    it.skipIf(skip)('should subscribe to all state changes by default', async () => {
      const namespace = createUniqueStoreName('default-subscription-test');
      const store1 = createTestStore({ namespace });
      const store2 = createTestStore({ namespace });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      store1.getState().increment();
      store2.getState().setText('Text');
      await waitFor(() => {
        expect(store1.getState().count).toBe(1);
        expect(store1.getState().text).toBe('Text');
        expect(store2.getState().count).toBe(1);
        expect(store2.getState().text).toBe('Text');
      });
    });

    it.skipIf(skip)('should only sync configured state keys when configured', async () => {
      const namespace = createUniqueStoreName('configured-sync-test');
      const store1 = createTestStore({ namespace, sync: ['text'] });
      const store2 = createTestStore({ namespace, sync: ['count'] });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      // Store1 syncs 'text' only, so its text changes will be published
      // but it won't receive count updates
      store1.getState().increment();
      store1.getState().setText('Text1');

      // Store2 syncs 'count' only, so its count changes will be published
      // but it won't receive text updates
      store2.getState().increment();
      store2.getState().setText('Text2');

      await waitFor(() => {
        // Store1 only syncs text, so it won't see store2's count update
        expect(store1.getState().count).toBe(1);
        expect(store1.getState().text).toBe('Text1');

        // Store2 only syncs count, so it won't see store1's text update
        expect(store2.getState().count).toBe(1);
        expect(store2.getState().text).toBe('Text2');
      });
    });

    it.skipIf(skip)('should publish all state changes by default', async () => {
      const namespace = createUniqueStoreName('publish-default-subscription-test');
      const store1 = createTestStore({ namespace });
      const store2 = createTestStore({ namespace });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      store1.getState().increment();
      store2.getState().setText('Text');
      await waitFor(() => {
        expect(store1.getState().count).toBe(1);
        expect(store1.getState().text).toBe('Text');
        expect(store2.getState().count).toBe(1);
        expect(store2.getState().text).toBe('Text');
      });
    });

    it.skipIf(skip)('should sync all fields when no sync option provided', async () => {
      const namespace = createUniqueStoreName('sync-all-test');
      const store1 = createTestStore({ namespace });
      const store2 = createTestStore({ namespace });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      store1.getState().increment();
      store1.getState().setText('Text');
      await waitFor(() => {
        expect(store1.getState().count).toBe(1);
        expect(store1.getState().text).toBe('Text');
        expect(store2.getState().count).toBe(1);
        expect(store2.getState().text).toBe('Text');
      });
    });
  });

  describe('Nested state synchronization tests', () => {
    it.skipIf(skip)('should synchronize nested state change with zFactor 0', async () => {
      const namespace = createUniqueStoreName('sync-nested-subscription-test-zfactor-0');
      const store1 = createTestStore({ namespace, zFactor: 0 });
      const store2 = createTestStore({ namespace, zFactor: 0 });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      store1.getState().updateNested('Value');
      await waitFor(() => {
        expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
        expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
      });
    });

    it.skipIf(skip)('should synchronize nested state change with zFactor 1', async () => {
      const namespace = createUniqueStoreName('sync-nested-subscription-test-zfactor-1');
      const store1 = createTestStore({ namespace, zFactor: 1 });
      const store2 = createTestStore({ namespace, zFactor: 1 });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      store1.getState().updateNested('Value');
      await waitFor(() => {
        expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
        expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
      });
    });

    it.skipIf(skip)('should synchronize nested state change with zFactor 2', async () => {
      const namespace = createUniqueStoreName('sync-nested-subscription-test-zfactor-2');
      const store1 = createTestStore({ namespace, zFactor: 2 });
      const store2 = createTestStore({ namespace, zFactor: 2 });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      store1.getState().updateNested('Value');
      await waitFor(() => {
        expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
        expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
      });
    });

    it.skipIf(skip)('should synchronize nested state change with zFactor 3', async () => {
      const namespace = createUniqueStoreName('sync-nested-subscription-test-zfactor-3');
      const store1 = createTestStore({ namespace, zFactor: 3 });
      const store2 = createTestStore({ namespace, zFactor: 3 });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      store1.getState().updateNested('Value');
      await waitFor(() => {
        expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
        expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
      });
    });

    it.skipIf(skip)('should synchronize nested state change with zFactor 4', async () => {
      const namespace = createUniqueStoreName('sync-nested-subscription-test-zfactor-4');
      const store1 = createTestStore({ namespace, zFactor: 4 });
      const store2 = createTestStore({ namespace, zFactor: 4 });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });
      store1.getState().updateNested('Value');
      await waitFor(() => {
        expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
        expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe('Value');
      });
    });
  });

  describe('Record state synchronization tests', () => {
    it.skipIf(skip)('should synchronize record state change with zFactor 0', async () => {
      const namespace = createUniqueStoreName('sync-record-subscription-test-zfactor-0');
      const store1 = createTestStore({ namespace, zFactor: 0 });
      const store2 = createTestStore({ namespace, zFactor: 0 });
      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().addRecord('key1', 'value1');
      store1.getState().addRecord('key2', 'value2');
      await waitFor(() => {
        expect(store1.getState().records).toEqual({
          key1: { value: 'value1' },
          key2: { value: 'value2' },
        });
        expect(store2.getState().records).toEqual({
          key1: { value: 'value1' },
          key2: { value: 'value2' },
        });
      });

      store1.getState().updateRecord('key1', 'value1-updated');
      await waitFor(() => {
        expect(store1.getState().records).toEqual({
          key1: { value: 'value1-updated' },
          key2: { value: 'value2' },
        });
        expect(store2.getState().records).toEqual({
          key1: { value: 'value1-updated' },
          key2: { value: 'value2' },
        });
      });

      store1.getState().removeRecord('key1');
      await waitFor(() => {
        expect(store1.getState().records).toEqual({ key2: { value: 'value2' } });
        expect(store2.getState().records).toEqual({ key2: { value: 'value2' } });
      });
    });

    it.skipIf(skip)('should synchronize record state change with zFactor 1', async () => {
      const namespace = createUniqueStoreName('sync-record-subscription-test-zfactor-1');
      const store1 = createTestStore({ namespace, zFactor: 1 });
      const store2 = createTestStore({ namespace, zFactor: 1 });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().addNestedRecord('key1', 'value1');
      store1.getState().addNestedRecord('key2', 'value2');
      await waitFor(() => {
        expect(store1.getState().nestedRecords.records).toEqual({
          key1: { value: 'value1' },
          key2: { value: 'value2' },
        });
        expect(store2.getState().nestedRecords.records).toEqual({
          key1: { value: 'value1' },
          key2: { value: 'value2' },
        });
      });

      store1.getState().updateNestedRecord('key1', 'value1-updated');
      await waitFor(() => {
        expect(store1.getState().nestedRecords.records).toEqual({
          key1: { value: 'value1-updated' },
          key2: { value: 'value2' },
        });
        expect(store2.getState().nestedRecords.records).toEqual({
          key1: { value: 'value1-updated' },
          key2: { value: 'value2' },
        });
      });

      store1.getState().removeNestedRecord('key1');
      await waitFor(() => {
        expect(store1.getState().nestedRecords.records).toEqual({ key2: { value: 'value2' } });
        expect(store2.getState().nestedRecords.records).toEqual({ key2: { value: 'value2' } });
      });
    });

    it.skipIf(skip)('should synchronize record state change with zFactor 2', async () => {
      const namespace = createUniqueStoreName('sync-record-subscription-test-zfactor-2');
      const store1 = createTestStore({ namespace, zFactor: 2 });
      const store2 = createTestStore({ namespace, zFactor: 2 });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().addRecord('key1', 'value1');
      store1.getState().addRecord('key2', 'value2');
      await waitFor(() => {
        expect(store1.getState().records).toEqual({
          key1: { value: 'value1' },
          key2: { value: 'value2' },
        });
        expect(store2.getState().records).toEqual({
          key1: { value: 'value1' },
          key2: { value: 'value2' },
        });
      });

      store1.getState().updateRecord('key1', 'value1-updated');
      await waitFor(() => {
        expect(store1.getState().records).toEqual({
          key1: { value: 'value1-updated' },
          key2: { value: 'value2' },
        });
        expect(store2.getState().records).toEqual({
          key1: { value: 'value1-updated' },
          key2: { value: 'value2' },
        });
      });

      store1.getState().removeRecord('key1');
      await waitFor(() => {
        expect(store1.getState().records).toEqual({ key2: { value: 'value2' } });
        expect(store2.getState().records).toEqual({ key2: { value: 'value2' } });
      });
    });

    it.skipIf(skip)('should synchronize record state change with zFactor 3', async () => {
      const namespace = createUniqueStoreName('sync-record-subscription-test-zfactor-3');
      const store1 = createTestStore({ namespace, zFactor: 3 });
      const store2 = createTestStore({ namespace, zFactor: 3 });

      await waitFor(() => {
        expect(store1.getState().multiplayer.hasHydrated).toBe(true);
        expect(store2.getState().multiplayer.hasHydrated).toBe(true);
      });

      store1.getState().addRecord('key1', 'value1');
      store1.getState().addRecord('key2', 'value2');
      await waitFor(() => {
        expect(store1.getState().records).toEqual({
          key1: { value: 'value1' },
          key2: { value: 'value2' },
        });
        expect(store2.getState().records).toEqual({
          key1: { value: 'value1' },
          key2: { value: 'value2' },
        });
      });

      store1.getState().updateRecord('key1', 'value1-updated');
      await waitFor(() => {
        expect(store1.getState().records).toEqual({
          key1: { value: 'value1-updated' },
          key2: { value: 'value2' },
        });
        expect(store2.getState().records).toEqual({
          key1: { value: 'value1-updated' },
          key2: { value: 'value2' },
        });
      });

      store1.getState().removeRecord('key1');
      await waitFor(() => {
        expect(store1.getState().records).toEqual({ key2: { value: 'value2' } });
        expect(store2.getState().records).toEqual({ key2: { value: 'value2' } });
      });
    });
  });

  describe('Eventual consistency tests', () => {
    it.skipIf(skip)(
      'should show eventual consistency and keep clients in sync when multiple clients updating state with zFactor 0',
      async () => {
        const namespace = createUniqueStoreName('sync-multilple-clients-subscription-test');
        const store1 = createTestStore({ namespace, zFactor: 0 });
        const store2 = createTestStore({ namespace, zFactor: 0 });
        const store3 = createTestStore({ namespace, zFactor: 0 });

        await waitFor(() => {
          expect(store1.getState().multiplayer.hasHydrated).toBe(true);
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
          expect(store3.getState().multiplayer.hasHydrated).toBe(true);
        });

        store1.getState().increment();
        store2.getState().setText('Text');
        store3.getState().increment();
        store2.getState().updateNested('Value');
        store1.getState().addRecord('key1', 'value1');
        store2.getState().updateNested('Value-updated');
        store1.getState().updateRecord('key1', 'value1-updated');
        store2.getState().addRecord('key2', 'value2');
        await new Promise(resolve => setTimeout(resolve, 50));
        store1.getState().increment();
        store3.getState().removeRecord('key2');

        await waitFor(() => {
          const count = store1.getState().count;
          const text = store1.getState().text;
          const nested = store1.getState().nested;
          const records = store1.getState().records;
          expect(store1.getState().count).toBe(count);
          expect(store2.getState().count).toBe(count);
          expect(store3.getState().count).toBe(count);
          expect(store1.getState().text).toBe(text);
          expect(store2.getState().text).toBe(text);
          expect(store3.getState().text).toBe(text);
          expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store3.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store1.getState().records).toEqual(records);
          expect(store2.getState().records).toEqual(records);
          expect(store3.getState().records).toEqual(records);
        });
      },
    );

    it.skipIf(skip)(
      'should show eventual consistency and keep clients in sync when multiple clients updating state with zFactor 1',
      async () => {
        const namespace = createUniqueStoreName(
          'sync-multilple-clients-subscription-test-zfactor-1',
        );
        const store1 = createTestStore({ namespace, zFactor: 1 });
        const store2 = createTestStore({ namespace, zFactor: 1 });
        const store3 = createTestStore({ namespace, zFactor: 1 });

        await waitFor(() => {
          expect(store1.getState().multiplayer.hasHydrated).toBe(true);
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
          expect(store3.getState().multiplayer.hasHydrated).toBe(true);
        });

        store1.getState().increment();
        store2.getState().setText('Text');
        store3.getState().increment();
        store2.getState().updateNested('Value');
        store1.getState().addRecord('key1', 'value1');
        store2.getState().addRecord('key2', 'value2');
        store3.getState().addRecord('key3', 'value3');
        store2.getState().updateNested('Value-updated');
        store1.getState().updateRecord('key1', 'value1-updated');
        store3.getState().removeRecord('key2');

        await waitFor(() => {
          const count = store1.getState().count;
          const text = store1.getState().text;
          const nested = store1.getState().nested;
          const records = store1.getState().records;
          expect(store1.getState().count).toBe(count);
          expect(store2.getState().count).toBe(count);
          expect(store3.getState().count).toBe(count);
          expect(store1.getState().text).toBe(text);
          expect(store2.getState().text).toBe(text);
          expect(store3.getState().text).toBe(text);
          expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store3.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store1.getState().records).toEqual(records);
          expect(store2.getState().records).toEqual(records);
          expect(store3.getState().records).toEqual(records);
        });
      },
    );

    it.skipIf(skip)(
      'should show eventual consistency and keep clients in sync when multiple clients updating state with zFactor 2',
      async () => {
        const namespace = createUniqueStoreName(
          'sync-multilple-clients-subscription-test-zfactor-2',
        );
        const store1 = createTestStore({ namespace, zFactor: 2 });
        const store2 = createTestStore({ namespace, zFactor: 2 });
        const store3 = createTestStore({ namespace, zFactor: 2 });

        await waitFor(() => {
          expect(store1.getState().multiplayer.hasHydrated).toBe(true);
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
          expect(store3.getState().multiplayer.hasHydrated).toBe(true);
        });

        store1.getState().increment();
        store2.getState().setText('Text');
        store3.getState().increment();
        store2.getState().updateNested('Value');
        store1.getState().addRecord('key1', 'value1');
        store2.getState().addRecord('key2', 'value2');
        store3.getState().addRecord('key3', 'value3');
        store2.getState().updateNested('Value-updated');
        store1.getState().updateRecord('key1', 'value1-updated');
        store3.getState().removeRecord('key2');

        await waitFor(() => {
          const count = store1.getState().count;
          const text = store1.getState().text;
          const nested = store1.getState().nested;
          const records = store1.getState().records;
          expect(store1.getState().count).toBe(count);
          expect(store2.getState().count).toBe(count);
          expect(store3.getState().count).toBe(count);
          expect(store1.getState().text).toBe(text);
          expect(store2.getState().text).toBe(text);
          expect(store3.getState().text).toBe(text);
          expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store3.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store1.getState().records).toEqual(records);
          expect(store2.getState().records).toEqual(records);
          expect(store3.getState().records).toEqual(records);
        });
      },
    );

    it.skipIf(skip)(
      'should show eventual consistency and keep clients in sync when multiple clients updating state with zFactor 3',
      async () => {
        const namespace = createUniqueStoreName(
          'sync-multilple-clients-subscription-test-zfactor-3',
        );
        const store1 = createTestStore({ namespace, zFactor: 3 });
        const store2 = createTestStore({ namespace, zFactor: 3 });
        const store3 = createTestStore({ namespace, zFactor: 3 });

        await waitFor(() => {
          expect(store1.getState().multiplayer.hasHydrated).toBe(true);
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
          expect(store3.getState().multiplayer.hasHydrated).toBe(true);
        });

        store1.getState().increment();
        store2.getState().setText('Text');
        store3.getState().increment();
        store2.getState().updateNested('Value');
        store1.getState().addRecord('key1', 'value1');
        store2.getState().addRecord('key2', 'value2');
        store3.getState().addRecord('key3', 'value3');
        store2.getState().updateNested('Value-updated');
        store1.getState().updateRecord('key1', 'value1-updated');
        store3.getState().removeRecord('key2');

        await waitFor(() => {
          const count = store1.getState().count;
          const text = store1.getState().text;
          const nested = store1.getState().nested;
          const records = store1.getState().records;
          expect(store1.getState().count).toBe(count);
          expect(store2.getState().count).toBe(count);
          expect(store3.getState().count).toBe(count);
          expect(store1.getState().text).toBe(text);
          expect(store2.getState().text).toBe(text);
          expect(store3.getState().text).toBe(text);
          expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store3.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store1.getState().records).toEqual(records);
          expect(store2.getState().records).toEqual(records);
          expect(store3.getState().records).toEqual(records);
        });
      },
    );

    it.skipIf(skip)(
      'should show eventual consistency and keep clients in sync when multiple clients updating state with zFactor 4',
      async () => {
        const namespace = createUniqueStoreName(
          'sync-multilple-clients-subscription-test-zfactor-4',
        );
        const store1 = createTestStore({ namespace, zFactor: 4 });
        const store2 = createTestStore({ namespace, zFactor: 4 });
        const store3 = createTestStore({ namespace, zFactor: 4 });

        await waitFor(() => {
          expect(store1.getState().multiplayer.hasHydrated).toBe(true);
          expect(store2.getState().multiplayer.hasHydrated).toBe(true);
          expect(store3.getState().multiplayer.hasHydrated).toBe(true);
        });

        store1.getState().increment();
        store2.getState().setText('Text');
        store3.getState().increment();
        store2.getState().updateNested('Value');
        store1.getState().addRecord('key1', 'value1');
        store2.getState().addRecord('key2', 'value2');
        store3.getState().addRecord('key3', 'value3');
        store2.getState().updateNested('Value-updated');
        store1.getState().updateRecord('key1', 'value1-updated');
        store3.getState().removeRecord('key2');

        await waitFor(() => {
          const count = store1.getState().count;
          const text = store1.getState().text;
          const nested = store1.getState().nested;
          const records = store1.getState().records;
          expect(store1.getState().count).toBe(count);
          expect(store2.getState().count).toBe(count);
          expect(store3.getState().count).toBe(count);
          expect(store1.getState().text).toBe(text);
          expect(store2.getState().text).toBe(text);
          expect(store3.getState().text).toBe(text);
          expect(store1.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store2.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store3.getState().nested.levelOne.levelTwo.levelThree.value).toBe(
            nested.levelOne.levelTwo.levelThree.value,
          );
          expect(store1.getState().records).toEqual(records);
          expect(store2.getState().records).toEqual(records);
          expect(store3.getState().records).toEqual(records);
        });
      },
    );
  });
});
