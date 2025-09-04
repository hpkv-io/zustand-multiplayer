import { describe, it, expect, vi } from 'vitest';
import { createStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { multiplayer } from '../../src/multiplayer';
import type { WithMultiplayer } from '../../src/types/multiplayer-types';
import { createUniqueStoreName, waitFor, waitForMultipleStores } from '../utils';

describe('Middleware Composition', () => {
  interface CounterState {
    count: number;
    increment: () => void;
  }

  it('works with immer middleware', async () => {
    const namespace = createUniqueStoreName('immer-tests');
    const store1 = createStore<WithMultiplayer<CounterState>>()(
      multiplayer(
        immer(set => ({
          count: 0,
          increment: () =>
            set(state => {
              state.count += 1;
            }),
        })),
        {
          namespace: namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
        },
      ),
    );

    const store2 = createStore<WithMultiplayer<CounterState>>()(
      multiplayer(
        immer(set => ({
          count: 0,
          increment: () =>
            set(state => {
              state.count += 1;
            }),
        })),
        {
          namespace: namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
        },
      ),
    );
    await waitForMultipleStores([store1, store2], 'hydrated');

    store1.getState().increment();

    await waitFor(() => expect(store2.getState().count).toBe(1));
    await store1.multiplayer.clearStorage();
    await store1.multiplayer.disconnect();
    await store1.multiplayer.destroy();
    await store2.multiplayer.disconnect();
    await store2.multiplayer.destroy();
  });

  it('works with sunbscribeWithSelectors middleware', async () => {
    const namespace = createUniqueStoreName('sunbscribeWithSelectors-tests');
    const store1 = createStore<WithMultiplayer<CounterState>>()(
      multiplayer(
        set => ({
          count: 0,
          increment: () =>
            set(state => ({
              count: state.count + 1,
            })),
        }),
        {
          namespace: namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
        },
      ),
    );

    const store2 = createStore<WithMultiplayer<CounterState>>()(
      multiplayer(
        subscribeWithSelector(set => ({
          count: 0,
          increment: () =>
            set(state => ({
              count: state.count + 1,
            })),
        })),
        {
          namespace: namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
        },
      ),
    );
    await waitForMultipleStores([store1, store2], 'hydrated');
    const subscriber = vi.fn();
    store2.subscribe(
      state => state.count,
      count => {
        subscriber(count);
      },
    );

    store1.getState().increment();

    await waitFor(() => expect(subscriber).toHaveBeenCalledWith(1));
    await store1.multiplayer.clearStorage();
    await store1.multiplayer.disconnect();
    await store1.multiplayer.destroy();
    await store2.multiplayer.disconnect();
    await store2.multiplayer.destroy();
  });

  it('works with combination of middlewares', async () => {
    const namespace = createUniqueStoreName('immer-tests');
    const store1 = createStore<WithMultiplayer<CounterState>>()(
      multiplayer(
        immer(set => ({
          count: 0,
          increment: () =>
            set(state => {
              state.count += 1;
            }),
        })),
        {
          namespace: namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
        },
      ),
    );
    const store2 = createStore<WithMultiplayer<CounterState>>()(
      multiplayer(
        immer(
          subscribeWithSelector(set => ({
            count: 0,
            increment: () =>
              set(state => ({
                count: state.count + 1,
              })),
          })),
        ),
        {
          namespace: namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
        },
      ),
    );
    await waitForMultipleStores([store1, store2], 'hydrated');
    const subscriber = vi.fn();
    store2.subscribe(
      state => state.count,
      count => {
        subscriber(count);
      },
    );

    store1.getState().increment();

    await waitFor(() => expect(subscriber).toHaveBeenCalledWith(1));
    await store1.multiplayer.clearStorage();
    await store1.multiplayer.disconnect();
    await store1.multiplayer.destroy();
    await store2.multiplayer.disconnect();
    await store2.multiplayer.destroy();
  });

  describe('Advanced Middleware Interactions', () => {
    it('should handle complex state with immer mutations', async () => {
      interface ComplexState {
        users: Record<string, { id: string; name: string; scores: number[] }>;
        metadata: { version: number; lastUpdated: string };
        addUser: (id: string, name: string) => void;
        addScore: (userId: string, score: number) => void;
        updateMetadata: () => void;
      }

      const complexInitializer = immer<ComplexState>(set => ({
        users: {},
        metadata: { version: 1, lastUpdated: new Date().toISOString() },
        addUser: (id: string, name: string) =>
          set(state => {
            state.users[id] = { id, name, scores: [] };
          }),
        addScore: (userId: string, score: number) =>
          set(state => {
            if (state.users[userId]) {
              state.users[userId].scores.push(score);
            }
          }),
        updateMetadata: () =>
          set(state => {
            state.metadata.version += 1;
            state.metadata.lastUpdated = new Date().toISOString();
          }),
      }));

      const namespace = createUniqueStoreName('complex-immer');
      const store1 = createStore<WithMultiplayer<ComplexState>>()(
        multiplayer(complexInitializer, {
          namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
          zFactor: 2,
        }),
      );
      const store2 = createStore<WithMultiplayer<ComplexState>>()(
        multiplayer(complexInitializer, {
          namespace,
          apiBaseUrl: process.env.HPKV_API_BASE_URL!,
          apiKey: process.env.HPKV_API_KEY,
          zFactor: 2,
        }),
      );

      await waitForMultipleStores([store1, store2], 'hydrated');

      // Complex mutations
      store1.getState().addUser('user1', 'Alice');
      store1.getState().addScore('user1', 100);
      store1.getState().addScore('user1', 150);
      store1.getState().updateMetadata();

      await waitFor(() => {
        const state = store2.getState();
        return (
          state.users['user1']?.name === 'Alice' &&
          state.users['user1']?.scores.length === 2 &&
          state.metadata.version === 2
        );
      });

      expect(store2.getState().users['user1'].scores).toEqual([100, 150]);
      await store1.multiplayer.clearStorage();
      await store1.multiplayer.disconnect();
      await store1.multiplayer.destroy();
      await store2.multiplayer.disconnect();
      await store2.multiplayer.destroy();
    });
  });
});
