import { ConnectionConfig } from '@hpkv/websocket-client';
import { RetryConfig } from '../network/retry';

// ============================================================================
// Storage-Related Types
// ============================================================================

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

/**
 * Type for objects that can be safely processed for path extraction
 */
export type PathExtractable = Record<string, SerializableValue>;

/**
 * Represents a path to a nested property in an object
 */
export interface PropertyPath<T = unknown> {
  path: string[];
  value: T;
}

// IsPlainObject and NestedKeyOf are now defined in ../types/multiplayer-types.ts

/**
 * Configuration options for storage operations
 */
export interface StorageOptions {
  namespace: string;
  apiBaseUrl: string;
  apiKey?: string;
  tokenGenerationUrl?: string;
  retryConfig?: RetryConfig;
  clientConfig?: ConnectionConfig;
} 