import { ConnectionConfig, ConnectionState, ConnectionStats } from '@hpkv/websocket-client';
import type { Draft } from 'immer';
import { StoreMutatorIdentifier } from 'zustand/vanilla';
import { LogLevel } from '../monitoring/logger';
import { PerformanceMetrics } from '../monitoring/profiler';
import { RetryConfig } from '../network/retry';
import { ConflictInfo, ConflictResolution } from '../sync/conflict-resolver';

// ============================================================================
// Core Options and State Interfaces
// ============================================================================

/**
 * Constraint for state types that can be used with multiplayer
 * Ensures the state is a serializable object
 */
export type MultiplayerCompatibleState = Record<string, SerializableValue>;

export interface MultiplayerOptions<TState> {
  namespace: string;
  apiBaseUrl: string;
  apiKey?: string;
  tokenGenerationUrl?: string;
  publishUpdatesFor?: () => Array<keyof TState>;
  subscribeToUpdatesFor?: () => Array<keyof TState>;
  onHydrate?: (state: TState) => void;
  onConflict?: (conflicts: ConflictInfo<TState>[]) => ConflictResolution<TState>;
  logLevel?: LogLevel;
  profiling?: boolean;
  retryConfig?: RetryConfig;
  clientConfig?: ConnectionConfig;
}

export interface MultiplayerState {
  connectionState: ConnectionState;
  hasHydrated: boolean;
  hydrate: () => Promise<void>;
  clearStorage: () => Promise<void>;
  disconnect: () => Promise<void>;
  connect: () => Promise<void>;
  destroy: () => Promise<void>;
  getConnectionStatus: () => ConnectionStats | null;
  getMetrics: () => PerformanceMetrics;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Write<T, U> = Omit<T, keyof U> & U;

export type SkipTwo<T> = T extends { length: 0 }
  ? []
  : T extends { length: 1 }
    ? []
    : T extends { length: 0 | 1 }
      ? []
      : T extends [unknown, unknown, ...infer A]
        ? A
        : T extends [unknown, unknown?, ...infer A]
          ? A
          : T extends [unknown?, unknown?, ...infer A]
            ? A
            : never;

export type SetStateType<T> = T extends readonly [any, ...any[]]
  ? Exclude<T[0], (...args: any[]) => any>
  : never;

/**
 * Represents a path to a nested property in an object
 */
export interface PropertyPath<T = unknown> {
  path: string[];
  value: T;
}

/**
 * Type for values that can be safely serialized and stored
 */
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SerializableValue[]
  | { [key: string]: SerializableValue };

export type PathExtractable = Record<string, SerializableValue>;

export type ImmerStateCreator<
  T,
  _Mis extends [StoreMutatorIdentifier, unknown][] = [],
  _Mos extends [StoreMutatorIdentifier, unknown][] = [],
  U = T,
> = (
  setState: (partial: T | Partial<T> | ((state: Draft<T>) => void), replace?: boolean) => void,
  getState: () => T,
  store: {
    setState: (partial: T | Partial<T> | ((state: Draft<T>) => void), replace?: boolean) => void;
    getState: () => T;
    subscribe: (listener: (state: T, prevState: T) => void) => () => void;
  },
) => U;

export type StoreWithImmerAndMultiplayer<S> = S extends { setState: infer SetState }
  ? SetState extends {
      (...args: infer A1): infer Sr1;
      (...args: infer _A2): infer Sr2;
    }
    ? {
        setState(
          nextStateOrUpdater:
            | SetStateType<A1>
            | Partial<SetStateType<A1>>
            | ((state: Draft<SetStateType<A1>>) => void),
          shouldReplace?: false,
          ...args: SkipTwo<A1>
        ): Sr1;
        setState(
          nextStateOrUpdater: SetStateType<A1> | ((state: Draft<SetStateType<A1>>) => void),
          shouldReplace: true,
          ...args: SkipTwo<A1>
        ): Sr2;
      }
    : never
  : never;

export type WithMultiplayerMiddleware<S, _A> = Write<
  S,
  StoreWithImmerAndMultiplayer<S> & { multiplayer: MultiplayerState }
>;

export type WithMultiplayer<S> = S & { multiplayer: MultiplayerState };

// Module declaration for Zustand
declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    'zustand/multiplayer': WithMultiplayerMiddleware<S, A>;
  }
}

// ============================================================================
// ERROR HANDLING SYSTEM
// ============================================================================

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error categories for better organization
 */
export enum ErrorCategory {
  TOKEN_GENERATION = 'token_generation',
  NETWORK = 'network',
  STORAGE = 'storage',
  HYDRATION = 'hydration',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  STATE_MANAGEMENT = 'state_management',
  CONFIGURATION = 'configuration',
  VALIDATION = 'validation',
}

/**
 * Base error context interface
 */
export interface ErrorContext {
  timestamp?: number;
  operation?: string;
  clientId?: string;
  namespace?: string;
  [key: string]: unknown;
}

/**
 * Enhanced base multiplayer error with better categorization
 */
export class MultiplayerError extends Error {
  public readonly timestamp: number;
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;

  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly context?: ErrorContext,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    category: ErrorCategory = ErrorCategory.STATE_MANAGEMENT,
  ) {
    super(message);
    this.name = 'MultiplayerError';
    this.timestamp = Date.now();
    this.severity = severity;
    this.category = category;
  }

  /**
   * Converts error to a serializable object for logging
   */
  toSerializable(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      severity: this.severity,
      category: this.category,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Authentication-related errors
 */
export class TokenGenerationError extends MultiplayerError {
  constructor(message: string, context?: ErrorContext) {
    super(
      message,
      'TOKEN_GENERATION_ERROR',
      true,
      context,
      ErrorSeverity.HIGH,
      ErrorCategory.TOKEN_GENERATION,
    );
    this.name = 'TokenGenerationError';
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends MultiplayerError {
  constructor(message: string, context?: ErrorContext) {
    super(
      message,
      'CONFIGURATION_ERROR',
      false,
      context,
      ErrorSeverity.HIGH,
      ErrorCategory.CONFIGURATION,
    );
    this.name = 'ConfigurationError';
  }
}

/**
 * State hydration errors
 */
export class HydrationError extends MultiplayerError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'HYDRATION_ERROR', true, context, ErrorSeverity.HIGH, ErrorCategory.HYDRATION);
    this.name = 'HydrationError';
  }
}
