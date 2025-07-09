// Export HPKVSubscriptionClient mock
export {
  MockHPKVSubscriptionClient,
  MockHPKVClientFactory,
  createMockToken,
} from './mock-hpkv-client';

// Export WebsocketTokenManager mock
export {
  MockTokenHelper,
  MockWebsocketTokenManager,
  createMockTokenManager,
} from './mock-token-manager';

// Import for use in helper functions
import { MockHPKVSubscriptionClient, createMockToken } from './mock-hpkv-client';

// Re-export types from the real package that are used in mocks
export {
  ConnectionState,
  ConnectionStats,
  ConnectionConfig,
  HPKVResponse,
  HPKVEventHandler,
  HPKVNotificationResponse,
  RangeQueryOptions,
  HPKVTokenConfig,
} from '@hpkv/websocket-client';

// ============================================================================
// TESTING UTILITIES FOR PATTERN-BASED SUBSCRIPTIONS
// ============================================================================

/**
 * Test helper to create tokens with pattern-based subscriptions
 *
 * @example Creating a token for granular todo subscriptions
 * ```typescript
 * import { createPatternToken } from '@/mocks';
 *
 * // Traditional exact key subscription
 * const exactToken = createPatternToken(['app:todos'], '^app:.*$');
 *
 * // Pattern-based subscription for granular updates
 * const patternToken = createPatternToken(['app:*', 'app:todos:*'], '^app:.*$');
 *
 * // Mixed patterns
 * const mixedToken = createPatternToken([
 *   'app:user',           // Exact match for user object
 *   'app:todos:*',        // All todo items
 *   'app:settings:*'      // All settings
 * ], '^app:.*$');
 * ```
 */
export function createPatternToken(patterns: string[], accessPattern?: string): string {
  return createMockToken(patterns, accessPattern);
}

/**
 * Test helper to simulate granular state updates for testing
 *
 * @example Testing granular todo updates
 * ```typescript
 * import { simulateGranularUpdates } from '@/mocks';
 *
 * // Simulate multiple users editing different todos
 * simulateGranularUpdates('app', [
 *   { field: 'todos', subKey: 'todo-1', value: { text: 'Updated by User A', completed: true } },
 *   { field: 'todos', subKey: 'todo-2', value: { text: 'Updated by User B', completed: false } },
 *   { field: 'todos', subKey: 'todo-3', operation: 'delete' }
 * ]);
 * ```
 */
export const simulateGranularUpdates = (
  namespace: string,
  updates: Array<{
    field: string;
    subKey?: string;
    value: any;
    operation?: 'set' | 'delete';
  }>,
) => MockHPKVSubscriptionClient.simulateGranularUpdates(namespace, updates);

/**
 * Test helper to verify pattern matching
 *
 * @example Verify which keys match patterns
 * ```typescript
 * import { getKeysMatchingPattern } from '@/mocks';
 *
 * // Check if keys match patterns
 * const matchingKeys = getKeysMatchingPattern('app:todos:*');
 * console.log(matchingKeys); // ['app:todos:todo-1', 'app:todos:todo-2', ...]
 * ```
 */
export const getKeysMatchingPattern = (pattern: string) =>
  MockHPKVSubscriptionClient.getKeysMatchingPattern(pattern);

// ============================================================================
// EXAMPLE USAGE FOR TESTING PATTERN-BASED SUBSCRIPTIONS
// ============================================================================

/**
 * Example test scenario showing pattern-based subscription functionality
 * This demonstrates how the updated mocks support granular state updates
 *
 * @example Complete test scenario
 * ```typescript
 * import {
 *   MockHPKVSubscriptionClient,
 *   createPatternToken,
 *   simulateGranularUpdates,
 *   getKeysMatchingPattern
 * } from '@/mocks';
 *
 * // Test granular todo updates with pattern subscriptions
 * async function testGranularTodoUpdates() {
 *   // Create a token that subscribes to all todo patterns
 *   const token = createPatternToken([
 *     'app:*',           // Subscribe to all top-level changes
 *     'app:todos:*',     // Subscribe to all individual todo changes
 *     'app:user'         // Subscribe to user object changes
 *   ], '^app:.*$');
 *
 *   // Create mock client with pattern token
 *   const client = new MockHPKVSubscriptionClient(token, 'ws://mock');
 *   await client.connect();
 *
 *   // Set up notification handler
 *   const notifications: any[] = [];
 *   client.subscribe((data) => {
 *     notifications.push(data);
 *   });
 *
 *   // Simulate granular updates (like from multiple users)
 *   simulateGranularUpdates('app', [
 *     { field: 'todos', subKey: 'todo-1', value: { text: 'Buy groceries', completed: false } },
 *     { field: 'todos', subKey: 'todo-2', value: { text: 'Walk the dog', completed: true } },
 *     { field: 'user', value: { name: 'Alice', email: 'alice@example.com' } }
 *   ]);
 *
 *   // Wait for notifications
 *   await new Promise(resolve => setTimeout(resolve, 50));
 *
 *   // Verify notifications were received
 *   console.log('Received notifications:', notifications.length); // Should be 3
 *   console.log('Todo notifications:', notifications.filter(n => n.key.includes('todos')));
 *   console.log('User notifications:', notifications.filter(n => n.key === 'app:user'));
 *
 *   // Verify pattern matching
 *   const todoKeys = getKeysMatchingPattern('app:todos:*');
 *   console.log('All todo keys:', todoKeys); // ['app:todos:todo-1', 'app:todos:todo-2']
 *
 *   // Test client pattern detection
 *   console.log('Would receive app:todos:todo-3?', client.wouldReceiveNotificationForKey('app:todos:todo-3')); // true
 *   console.log('Would receive other:data?', client.wouldReceiveNotificationForKey('other:data')); // false
 *
 *   await client.disconnect();
 * }
 * ```
 */
