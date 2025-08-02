import { EventEmitter } from 'events';
import type {
  ConnectionStats,
  ConnectionConfig,
  HPKVResponse,
  HPKVEventHandler,
  HPKVNotificationResponse,
  RangeQueryOptions,
} from '@hpkv/websocket-client';
import { ConnectionState } from '@hpkv/websocket-client';

const globalHPKVStore = new Map<string, string>();
const activeClients = new Set<MockHPKVSubscriptionClient>();

interface TokenInfo {
  subscribeKeys: string[];
  accessPattern?: string;
}

function decodeToken(token: string): TokenInfo {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString()) as TokenInfo;
    return {
      subscribeKeys: decoded.subscribeKeys ?? [],
      accessPattern: decoded.accessPattern,
    };
  } catch {
    return {
      subscribeKeys: [],
      accessPattern: '.*',
    };
  }
}

function matchesAccessPattern(key: string, pattern?: string): boolean {
  if (!pattern) return true;
  try {
    const regex = new RegExp(pattern);
    return regex.test(key);
  } catch {
    return false;
  }
}

function isObject(value: any): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target: any, source: any): any {
  if (!isObject(target) || !isObject(source)) {
    return source;
  }

  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (isObject(target[key]) && isObject(source[key])) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

function matchesSubscriptionPattern(key: string, subscribeKeys: string[]): boolean {
  return subscribeKeys.some(pattern => {
    if (pattern === key) {
      return true;
    }

    if (pattern.includes('*')) {
      const escapedPattern = pattern
        .split('*')
        .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');

      try {
        const regex = new RegExp(`^${escapedPattern}$`);
        return regex.test(key);
      } catch (error) {
        console.warn('Invalid pattern:', pattern, error);
        return false;
      }
    }

    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        const regexPattern = pattern.slice(1, -1);
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

function broadcastChange(key: string, value: string | null, excludeClientId?: string) {
  activeClients.forEach(client => {
    if (client.getConnectionState() !== ConnectionState.CONNECTED) return;
    if (excludeClientId && client.clientId === excludeClientId) return;
    const tokenInfo = client.getTokenInfo();

    if (matchesSubscriptionPattern(key, tokenInfo.subscribeKeys)) {
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
  private readonly connectionStats: ConnectionStats;
  private readonly subscribers = new Map<string, HPKVEventHandler>();
  private readonly tokenInfo: TokenInfo;
  private connected = false;
  private reconnectAttempts = 0;
  private readonly messagesPending = 0;
  private shouldFailOperations = false;
  private operationDelay = 10;
  private connectPromise: Promise<void> | null = null;
  private disconnectPromise: Promise<void> | null = null;
  public readonly clientId: string;

  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
    private readonly config?: ConnectionConfig,
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

    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

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

    if (!matchesAccessPattern(key, this.tokenInfo.accessPattern)) {
      return { code: 403, error: 'Access denied' };
    }

    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    const value = globalHPKVStore.get(key);
    if (!value) {
      return { code: 404, error: 'Key not found' };
    }
    return {
      code: 200,
      success: true,
      key,
      value: value,
    };
  }

  async set(key: string, value: string, partialUpdate?: boolean): Promise<HPKVResponse> {
    if (this.shouldFailOperations) {
      return { code: 500, error: 'Simulated failure' };
    }

    if (!this.connected) {
      return { code: 500, error: 'Not connected' };
    }

    if (!matchesAccessPattern(key, this.tokenInfo.accessPattern)) {
      return { code: 403, error: 'Access denied' };
    }

    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    try {
      const parsedValue = JSON.parse(value) as { value: string | null };
      if (parsedValue && typeof parsedValue === 'object' && parsedValue.value === null) {
        const existed = globalHPKVStore.has(key);
        globalHPKVStore.delete(key);

        if (existed) {
          broadcastChange(key, null, this.clientId);
        }

        return {
          code: 200,
          success: true,
          key,
        };
      }
    } catch {}

    if (partialUpdate && globalHPKVStore.has(key)) {
      const existingValue = globalHPKVStore.get(key)!;
      try {
        const existing = JSON.parse(existingValue) as {
          value: any;
          clientId: string;
          timestamp: number;
        };
        const update = JSON.parse(value) as { value: any; clientId: string; timestamp: number };

        let mergedValue;
        if (isObject(existing.value) && isObject(update.value)) {
          mergedValue = deepMerge(existing.value, update.value);
        } else {
          mergedValue = update.value;
        }

        const merged = {
          ...existing,
          ...update,
          value: mergedValue,
        };
        globalHPKVStore.set(key, JSON.stringify(merged));
      } catch {
        globalHPKVStore.set(key, existingValue + value);
      }
    } else {
      globalHPKVStore.set(key, value);
    }

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

    if (!matchesAccessPattern(key, this.tokenInfo.accessPattern)) {
      return { code: 403, error: 'Access denied' };
    }

    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    const existed = globalHPKVStore.has(key);
    globalHPKVStore.delete(key);

    if (existed) {
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

    if (!matchesAccessPattern(key, this.tokenInfo.accessPattern)) {
      return { code: 403, error: 'Access denied' };
    }

    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    const currentValue = globalHPKVStore.get(key);
    const currentNum = currentValue ? parseInt(currentValue, 10) : 0;
    const newValue = currentNum + delta;

    globalHPKVStore.set(key, newValue.toString());

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
  ): Promise<{
    code: number;
    success?: boolean;
    records?: Array<{ key: string; value: string }>;
    count?: number;
    truncated?: boolean;
    error?: string;
  }> {
    if (this.shouldFailOperations) {
      return { code: 500, error: 'Simulated failure' };
    }

    if (!this.connected) {
      return { code: 500, error: 'Not connected' };
    }

    await new Promise(resolve => setTimeout(resolve, this.operationDelay));

    const sortedKeys = Array.from(globalHPKVStore.keys()).sort();
    const keysInRange = sortedKeys.filter(key => key >= startKey && key < endKey);

    const allowedKeys = keysInRange.filter(key =>
      matchesAccessPattern(key, this.tokenInfo.accessPattern),
    );

    const limit = options?.limit ?? 1000;
    const results = allowedKeys.slice(0, limit).map(key => ({
      key,
      value: globalHPKVStore.get(key)!,
    }));

    return {
      code: 200,
      success: true,
      records: results,
      count: results.length,
      truncated: allowedKeys.length > limit,
    };
  }

  async clear(): Promise<void> {
    if (this.shouldFailOperations) {
      throw new Error('Simulated failure');
    }

    if (!this.connected) {
      throw new Error('Not connected');
    }

    const pattern = this.tokenInfo.accessPattern ?? '.*';

    const keysToDelete: string[] = [];
    for (const key of globalHPKVStore.keys()) {
      if (matchesAccessPattern(key, pattern)) {
        keysToDelete.push(key);
      }
    }

    await new Promise(() => {
      for (const key of keysToDelete) {
        globalHPKVStore.delete(key);
        broadcastChange(key, null, this.clientId);
      }
    });
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

  getTokenInfo(): TokenInfo {
    return this.tokenInfo;
  }

  setShouldFailOperations(shouldFail: boolean): void {
    this.shouldFailOperations = shouldFail;
  }
  setOperationDelay(delay: number): void {
    this.operationDelay = delay;
  }

  simulateDisconnect(): void {
    if (!this.connected) return;

    this.connected = false;
    this.updateConnectionState(ConnectionState.DISCONNECTED);
    this.emit('disconnected');

    if (
      this.config?.maxReconnectAttempts &&
      this.reconnectAttempts < this.config.maxReconnectAttempts
    ) {
      this.reconnectAttempts++;
      this.updateConnectionState(ConnectionState.RECONNECTING);
      this.emit('reconnecting');

      setTimeout(() => {
        if (this.reconnectAttempts >= (this.config?.maxReconnectAttempts ?? 3)) {
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

  static clearGlobalStore(): void {
    globalHPKVStore.clear();
  }

  static getGlobalStore(): Map<string, string> {
    return new Map(globalHPKVStore);
  }

  static findClientsByNamespace(namespace: string): MockHPKVSubscriptionClient[] {
    return Array.from(activeClients).filter(client => {
      const tokenInfo = client.getTokenInfo();
      return tokenInfo.accessPattern && new RegExp(tokenInfo.accessPattern).test(`${namespace}:`);
    });
  }

  static getActiveClients(): MockHPKVSubscriptionClient[] {
    return Array.from(activeClients);
  }
}

export const MockHPKVClientFactory = {
  createSubscriptionClient(
    token: string,
    baseUrl: string,
    config?: ConnectionConfig,
  ): MockHPKVSubscriptionClient {
    return new MockHPKVSubscriptionClient(token, baseUrl, config);
  },

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

export function createMockToken(subscribeKeys: string[], accessPattern?: string): string {
  const tokenData = {
    subscribeKeys,
    accessPattern,
  };
  return Buffer.from(JSON.stringify(tokenData)).toString('base64');
}
