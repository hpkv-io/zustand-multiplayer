import { EventEmitter } from 'events';
import {
  ConnectionState,
  ConnectionStats,
  ConnectionConfig,
  HPKVResponse,
  HPKVEventHandler,
  HPKVNotificationResponse,
  RangeQueryOptions,
} from '@hpkv/websocket-client';

// Simulated server-side storage
const globalHPKVStore = new Map<string, string>();
const activeClients = new Set<MockHPKVSubscriptionClient>();

// Token information extracted from JWT-like token
interface TokenInfo {
  subscribeKeys: string[];
  accessPattern?: string;
}

// Simulated token decoder
function decodeToken(token: string): TokenInfo {
  // In real implementation, this would decode JWT
  // For mock, we'll encode info in base64
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    return {
      subscribeKeys: decoded.subscribeKeys || [],
      accessPattern: decoded.accessPattern,
    };
  } catch {
    // Default token for testing
    return {
      subscribeKeys: [],
      accessPattern: '.*', // Allow all by default
    };
  }
}

// Helper to check if a key matches access pattern
function matchesAccessPattern(key: string, pattern?: string): boolean {
  if (!pattern) return true;
  try {
    const regex = new RegExp(pattern);
    return regex.test(key);
  } catch {
    return false;
  }
}

// Helper to check if a key matches any subscription pattern
function matchesSubscriptionPattern(key: string, subscribeKeys: string[]): boolean {
  return subscribeKeys.some(pattern => {
    // Exact match - this should handle most existing tests
    if (pattern === key) {
      return true;
    }

    // Pattern matching for wildcard subscriptions
    if (pattern.includes('*')) {
      // Simple wildcard matching
      // Convert "namespace:*" to match "namespace:anything"
      // Convert "namespace:field:*" to match "namespace:field:anything"
      const escapedPattern = pattern
        .split('*')
        .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')) // Escape regex special chars
        .join('.*'); // Replace * with .*

      try {
        const regex = new RegExp(`^${escapedPattern}$`);
        return regex.test(key);
      } catch (error) {
        console.warn('Invalid pattern:', pattern, error);
        return false;
      }
    }

    // Support for explicit regex patterns (if the pattern starts and ends with /)
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        const regexPattern = pattern.slice(1, -1); // Remove leading and trailing /
        const regex = new RegExp(regexPattern);
        return regex.test(key);
      } catch (error) {
        console.warn('Invalid regex pattern:', pattern, error);
        return false;
      }
    }

    return false;
  });
}

// Broadcast changes to all subscribed clients
function broadcastChange(key: string, value: string | null, sourceClientId: string) {
  activeClients.forEach(client => {
    if (client.getConnectionState() !== ConnectionState.CONNECTED) return;
    const tokenInfo = client.getTokenInfo();

    // Check if the key matches any subscription pattern
    if (matchesSubscriptionPattern(key, tokenInfo.subscribeKeys)) {
      // Simulate async notification
      setImmediate(() => {
        client.notifySubscribers({
          type: 'notification',
          key,
          value: value ?? null,
          timestamp: Date.now(),
        });
      });
    }
  });
}

export class MockHPKVSubscriptionClient extends EventEmitter {
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private connectionStats: ConnectionStats;
  private subscribers = new Map<string, HPKVEventHandler>();
  private tokenInfo: TokenInfo;
  private connected = false;
  private reconnectAttempts = 0;
  private messagesPending = 0;
  private shouldFailOperations = false;
  private operationDelay = 10;
  private connectPromise: Promise<void> | null = null;
  private disconnectPromise: Promise<void> | null = null;
  public readonly clientId: string;

  constructor(
    private token: string,
    private baseUrl: string,
    private config?: ConnectionConfig,
  ) {
    super();
    this.clientId = `mock_client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    this.tokenInfo = decodeToken(token);

    this.connectionStats = {
      isConnected: false,
      reconnectAttempts: 0,
      messagesPending: 0,
      connectionState: ConnectionState.DISCONNECTED,
    };

    // Register this client
    activeClients.add(this);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.performConnect();

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async performConnect(): Promise<void> {
    this.updateConnectionState(ConnectionState.CONNECTING);

    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    // Simulate connection success
    this.connected = true;
    this.reconnectAttempts = 0;
    this.updateConnectionState(ConnectionState.CONNECTED);
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    if (this.disconnectPromise) {
      return this.disconnectPromise;
    }

    this.disconnectPromise = this.performDisconnect();

    try {
      await this.disconnectPromise;
    } finally {
      this.disconnectPromise = null;
    }
  }

  private async performDisconnect(): Promise<void> {
    // Simulate disconnect delay
    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    this.connected = false;
    this.updateConnectionState(ConnectionState.DISCONNECTED);
    this.emit('disconnected');
  }

  destroy(): void {
    this.connected = false;
    this.subscribers.clear();
    this.removeAllListeners();
    activeClients.delete(this);
  }

  subscribe(callback: HPKVEventHandler): string {
    const callbackId = `cb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.subscribers.set(callbackId, callback);
    return callbackId;
  }

  unsubscribe(callbackId: string): void {
    this.subscribers.delete(callbackId);
  }

  notifySubscribers(data: HPKVNotificationResponse): void {
    this.subscribers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in subscriber callback:', error);
      }
    });
  }

  async get(key: string): Promise<HPKVResponse> {
    if (this.shouldFailOperations) {
      return { code: 500, error: 'Simulated failure' };
    }

    if (!this.connected) {
      return { code: 500, error: 'Not connected' };
    }

    // Check access permission
    if (!matchesAccessPattern(key, this.tokenInfo.accessPattern)) {
      return { code: 403, error: 'Access denied' };
    }

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    const value = globalHPKVStore.get(key);

    return {
      code: 200,
      success: true,
      key,
      value: value ?? null,
    };
  }

  async set(key: string, value: string, partialUpdate?: boolean): Promise<HPKVResponse> {
    if (this.shouldFailOperations) {
      return { code: 500, error: 'Simulated failure' };
    }

    if (!this.connected) {
      return { code: 500, error: 'Not connected' };
    }

    // Check access permission
    if (!matchesAccessPattern(key, this.tokenInfo.accessPattern)) {
      return { code: 403, error: 'Access denied' };
    }

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    if (partialUpdate && globalHPKVStore.has(key)) {
      // Simulate JSON patching for partial updates
      const existingValue = globalHPKVStore.get(key)!;
      try {
        const existing = JSON.parse(existingValue);
        const update = JSON.parse(value);
        const merged = { ...existing, ...update };
        globalHPKVStore.set(key, JSON.stringify(merged));
      } catch {
        // If not JSON, just append
        globalHPKVStore.set(key, existingValue + value);
      }
    } else {
      globalHPKVStore.set(key, value);
    }

    // Broadcast to other clients
    broadcastChange(key, value, this.clientId);

    return {
      code: 200,
      success: true,
      key,
      value,
    };
  }

  async delete(key: string): Promise<HPKVResponse> {
    if (this.shouldFailOperations) {
      return { code: 500, error: 'Simulated failure' };
    }

    if (!this.connected) {
      return { code: 500, error: 'Not connected' };
    }

    // Check access permission
    if (!matchesAccessPattern(key, this.tokenInfo.accessPattern)) {
      return { code: 403, error: 'Access denied' };
    }

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    const existed = globalHPKVStore.has(key);
    globalHPKVStore.delete(key);

    if (existed) {
      // Broadcast deletion to other clients
      broadcastChange(key, null, this.clientId);
    }

    return {
      code: 200,
      success: true,
      key,
    };
  }

  async atomicIncrement(key: string, delta: number): Promise<HPKVResponse> {
    if (this.shouldFailOperations) {
      return { code: 500, error: 'Simulated failure' };
    }

    if (!this.connected) {
      return { code: 500, error: 'Not connected' };
    }

    // Check access permission
    if (!matchesAccessPattern(key, this.tokenInfo.accessPattern)) {
      return { code: 403, error: 'Access denied' };
    }

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    const currentValue = globalHPKVStore.get(key);
    const currentNum = currentValue ? parseInt(currentValue, 10) : 0;
    const newValue = currentNum + delta;

    globalHPKVStore.set(key, newValue.toString());

    // Broadcast to other clients
    broadcastChange(key, newValue.toString(), this.clientId);

    return {
      code: 200,
      success: true,
      key,
      newValue,
    };
  }

  async range(
    startKey: string,
    endKey: string,
    options?: RangeQueryOptions,
  ): Promise<HPKVResponse> {
    if (this.shouldFailOperations) {
      return { code: 500, error: 'Simulated failure' };
    }

    if (!this.connected) {
      return { code: 500, error: 'Not connected' };
    }

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    const records: Array<{ key: string; value: string }> = [];
    const limit = options?.limit || 1000;

    // Get all keys in range
    const sortedKeys = Array.from(globalHPKVStore.keys()).sort();

    for (const key of sortedKeys) {
      if (key >= startKey && key < endKey) {
        // Check access permission
        if (matchesAccessPattern(key, this.tokenInfo.accessPattern)) {
          records.push({
            key,
            value: globalHPKVStore.get(key)!,
          });

          if (records.length >= limit) {
            break;
          }
        }
      }
    }

    return {
      code: 200,
      success: true,
      records,
      count: records.length,
      truncated: records.length >= limit,
    };
  }

  getConnectionStats(): ConnectionStats {
    return {
      ...this.connectionStats,
      isConnected: this.connected,
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      messagesPending: this.messagesPending,
    };
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.connectionStats.connectionState = state;
    this.connectionStats.isConnected = state === ConnectionState.CONNECTED;
  }

  // Helper method for testing
  getTokenInfo(): TokenInfo {
    return this.tokenInfo;
  }

  setShouldFailOperations(shouldFail: boolean): void {
    this.shouldFailOperations = shouldFail;
  }
  setOperationDelay(delay: number): void {
    this.operationDelay = delay;
  }

  // Test helper to simulate reconnection scenarios
  simulateDisconnect(): void {
    if (!this.connected) return;

    this.connected = false;
    this.updateConnectionState(ConnectionState.DISCONNECTED);
    this.emit('disconnected');

    // Simulate reconnection attempt
    if (
      this.config?.maxReconnectAttempts &&
      this.reconnectAttempts < this.config.maxReconnectAttempts
    ) {
      this.reconnectAttempts++;
      this.updateConnectionState(ConnectionState.RECONNECTING);
      this.emit('reconnecting');

      setTimeout(() => {
        if (this.reconnectAttempts >= (this.config?.maxReconnectAttempts || 3)) {
          this.updateConnectionState(ConnectionState.DISCONNECTED);
          this.emit('reconnectFailed');
        } else {
          this.connected = true;
          this.updateConnectionState(ConnectionState.CONNECTED);
          this.emit('connected');
        }
      }, 100);
    }
  }

  // Test helper to clear global store
  static clearGlobalStore(): void {
    globalHPKVStore.clear();
  }

  // Test helper to get global store state
  static getGlobalStore(): Map<string, string> {
    return new Map(globalHPKVStore);
  }

  // Test helper to find active clients by namespace
  static findClientsByNamespace(namespace: string): MockHPKVSubscriptionClient[] {
    return Array.from(activeClients).filter(client => {
      const tokenInfo = client.getTokenInfo();
      return tokenInfo.accessPattern && new RegExp(tokenInfo.accessPattern).test(`${namespace}:`);
    });
  }

  // Test helper to get all active clients
  static getActiveClients(): MockHPKVSubscriptionClient[] {
    return Array.from(activeClients);
  }

  /**
   * Test utility: Check if a client would receive notifications for a key
   */
  wouldReceiveNotificationForKey(key: string): boolean {
    if (this.getConnectionState() !== ConnectionState.CONNECTED) return false;
    return matchesSubscriptionPattern(key, this.tokenInfo.subscribeKeys);
  }

  /**
   * Test utility: Get all subscription patterns for this client
   */
  getSubscriptionPatterns(): string[] {
    return [...this.tokenInfo.subscribeKeys];
  }

  /**
   * Test utility: Simulate pattern-based key changes for testing
   */
  static simulateGranularUpdates(
    namespace: string,
    updates: Array<{
      field: string;
      subKey?: string;
      value: any;
      operation?: 'set' | 'delete';
    }>,
  ) {
    updates.forEach(update => {
      const key = update.subKey
        ? `${namespace}:${update.field}:${update.subKey}`
        : `${namespace}:${update.field}`;

      if (update.operation === 'delete') {
        globalHPKVStore.delete(key);
        broadcastChange(key, null, 'test_simulator');
      } else {
        const value =
          typeof update.value === 'string' ? update.value : JSON.stringify(update.value);
        globalHPKVStore.set(key, value);
        broadcastChange(key, value, 'test_simulator');
      }
    });
  }

  /**
   * Test utility: Get all keys that match a pattern
   */
  static getKeysMatchingPattern(pattern: string): string[] {
    const keys = Array.from(globalHPKVStore.keys());
    return keys.filter(key => matchesSubscriptionPattern(key, [pattern]));
  }
}

// Mock factory to match the real implementation
export const MockHPKVClientFactory = {
  createSubscriptionClient(
    token: string,
    baseUrl: string,
    config?: ConnectionConfig,
  ): MockHPKVSubscriptionClient {
    return new MockHPKVSubscriptionClient(token, baseUrl, config);
  },

  // Test helper methods
  findClientsByNamespace(namespace: string): MockHPKVSubscriptionClient[] {
    return MockHPKVSubscriptionClient.findClientsByNamespace(namespace);
  },

  getActiveClients(): MockHPKVSubscriptionClient[] {
    return MockHPKVSubscriptionClient.getActiveClients();
  },

  clearGlobalStore(): void {
    MockHPKVSubscriptionClient.clearGlobalStore();
  },

  getGlobalStore(): Map<string, string> {
    return MockHPKVSubscriptionClient.getGlobalStore();
  },
};

// Helper to create test tokens
export function createMockToken(subscribeKeys: string[], accessPattern?: string): string {
  const tokenData = {
    subscribeKeys,
    accessPattern,
  };
  return Buffer.from(JSON.stringify(tokenData)).toString('base64');
}
