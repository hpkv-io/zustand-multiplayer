import type { ConnectionState, ConnectionStats } from '@hpkv/websocket-client';
import type { StoreApi } from 'zustand';
import type { LogLevel } from '../monitoring/logger';
import type { PerformanceMetrics } from '../monitoring/profiler';

export interface MultiplayerOptions<TState> {
  namespace: string;
  apiBaseUrl: string;
  apiKey?: string;
  tokenGenerationUrl?: string;
  sync?: Array<keyof TState>;
  logLevel?: LogLevel;
  rateLimit?: number;
  zFactor?: number;
}

export interface MultiplayerState {
  connectionState: ConnectionState;
  hasHydrated: boolean;
  performanceMetrics: PerformanceMetrics;
}

export type MultiplayerStoreApi<S> = StoreApi<S> & {
  multiplayer: {
    reHydrate: () => Promise<void>;
    clearStorage: () => Promise<void>;
    disconnect: () => Promise<void>;
    connect: () => Promise<void>;
    destroy: () => Promise<void>;
    getConnectionStatus: () => ConnectionStats | null;
    getMetrics: () => PerformanceMetrics;
  };
};

export type WithMultiplayer<S> = S & { multiplayer: MultiplayerState };
export type MultiplayerStore<S, _U> = S extends { getState: () => infer T }
  ? MultiplayerStoreApi<T>
  : never;

// Module declaration for Zustand
declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    'zustand/multiplayer': MultiplayerStore<S, A>;
  }
}
