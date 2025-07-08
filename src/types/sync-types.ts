import { PropertyPath } from './storage-types';

// ============================================================================
// Sync-Related Types
// ============================================================================

/**
 * Type for state change operations including both changes and deletions
 */
export interface StateChangeOperation<T> {
  changes: Partial<T>;
  deletions: PropertyPath[];
}

/**
 * Type for state update functions that can be passed to setState
 */
export type StateUpdater<T> = 
  | T 
  | Partial<T> 
  | ((state: T) => T | Partial<T>) 
  | StateChangeOperation<T>;

/**
 * Type for conflict resolution strategies
 */
export type ConflictStrategy = 'keep-local' | 'keep-remote' | 'merge' | 'manual';

/**
 * Enhanced conflict resolution type with better typing
 */
export interface TypedConflictResolution<T> {
  strategy: ConflictStrategy;
  manualResolution?: Partial<T>;
} 