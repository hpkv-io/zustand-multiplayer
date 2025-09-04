import type {
  HPKVSubscriptionClient,
  HPKVNotificationResponse,
  ConnectionStats,
} from '@hpkv/websocket-client';
import { ConnectionState, HPKVClientFactory } from '@hpkv/websocket-client';
import { TokenManager } from '../auth/token-manager';
import type { Logger } from '../monitoring/logger';
import type { PerformanceMonitor } from '../monitoring/profiler';
import { generateClientId } from '../utils';
import { createRetryManager } from '../utils/retry';
import { StorageKeyManager } from './storage-key-manager';

export interface HPKVChangeEvent {
  key: string;
  value: unknown;
  timestamp?: number;
}

export type HPKVChangeListener = (event: HPKVChangeEvent) => void;
export type HPKVConnectionListener = (connectionState: ConnectionState) => void;

export interface StoredValue {
  value: unknown;
  clientId?: string;
  timestamp?: number;
}

export interface HPKVStorageOptions {
  namespace: string;
  apiBaseUrl: string;
  apiKey?: string;
  tokenGenerationUrl?: string;
  rateLimit?: number;
  zFactor?: number;
}

/**
 * HPKV storage implementation focused on core functionality
 * Clean and maintainable implementation without unnecessary abstractions
 */
export class HPKVStorage {
  // Core client and subscription
  private client: HPKVSubscriptionClient | null = null;
  private subscriptionId: string | null = null;
  private connectionPromise: Promise<void> | null = null;
  private readonly changeListeners = new Set<(event: HPKVChangeEvent) => void>();
  private readonly connectionListeners = new Set<(state: ConnectionState) => void>();
  private readonly cleanupCallbacks = new Set<() => void>();
  private readonly clientId: string;
  private readonly tokenManager: TokenManager;
  private readonly keyManager: StorageKeyManager;
  private readonly retryManager;

  private isDestroyed = false;

  constructor(
    private readonly options: HPKVStorageOptions,
    private readonly subscribedKeys: string[],
    private readonly logger: Logger,
    private readonly performanceMonitor: PerformanceMonitor,
  ) {
    if (!options.namespace) {
      throw new Error('namespace is required');
    }

    this.clientId = generateClientId();
    this.retryManager = createRetryManager();
    this.keyManager = new StorageKeyManager(options.namespace, options.zFactor);

    this.tokenManager = new TokenManager({
      namespace: options.namespace,
      apiBaseUrl: options.apiBaseUrl,
      apiKey: options.apiKey,
      tokenGenerationUrl: options.tokenGenerationUrl,
      subscribedKeys: this.subscribedKeys,
      keyManager: this.keyManager,
      retryManager: this.retryManager,
      logger: this.logger,
      clientId: this.clientId,
    });

    this.tokenManager.setTokenRefreshCallback(() => this.handleTokenRefresh());
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getClientId(): string {
    return this.clientId;
  }

  addChangeListener(listener: (event: HPKVChangeEvent) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  addConnectionListener(listener: (state: ConnectionState) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  async ensureConnection(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('Client has been destroyed');
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const stats = this.client?.getConnectionStats();
    if (this.client && stats?.connectionState === ConnectionState.CONNECTED) {
      return;
    }

    this.connectionPromise = this.connectInternal().finally(() => {
      this.connectionPromise = null;
    });

    return this.connectionPromise;
  }

  getConnectionStatus(): ConnectionStats | null {
    return this.client?.getConnectionStats() ?? null;
  }

  async getAllItems(): Promise<Map<string, unknown>> {
    await this.ensureConnection();
    if (!this.client) {
      throw new Error('No connection available');
    }

    const result = new Map<string, unknown>();
    const namespaceRange = this.keyManager.getNamespaceRange();
    let startKey = namespaceRange.start;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.range(startKey, namespaceRange.end);

      if (response.records) {
        for (const record of response.records) {
          try {
            const storedValue: StoredValue = JSON.parse(record.value) as StoredValue;
            result.set(record.key, storedValue.value);
          } catch {
            result.set(record.key, record.value);
          }
        }

        if (response.truncated && response.records.length > 0) {
          const lastRecord = response.records[response.records.length - 1];
          startKey = `${lastRecord.key}\0`;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return result;
  }

  async setItem(key: string, value: unknown): Promise<void> {
    await this.ensureConnection();
    if (!this.client) {
      throw new Error('No connection available');
    }

    const storedValue: StoredValue = {
      value,
      clientId: this.clientId,
      timestamp: Date.now(),
    };
    try {
      const startTime = Date.now();
      const response = await this.client.set(key, JSON.stringify(storedValue), true);
      const syncTime = Date.now() - startTime;

      if (!response.success) {
        throw new Error(`Set operation did not succeed: ${response.code}`);
      }

      this.performanceMonitor.recordSyncTime(syncTime);
    } catch (error) {
      this.logger.error('Failed to store item in the database', error as Error);
    }
  }

  async removeItem(key: string): Promise<void> {
    await this.ensureConnection();

    const response = await this.client?.delete(key);
    if (!response?.success) {
      throw new Error(`Failed to remove item: ${response?.code}`);
    }
  }

  async clear(): Promise<void> {
    const items = await this.getAllItems();
    const removePromises = Array.from(items.keys()).map(key => this.removeItem(key));
    await Promise.all(removePromises);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.notifyConnectionListeners(ConnectionState.DISCONNECTED);
    }
    this.cleanup();
  }

  async destroy(): Promise<void> {
    this.isDestroyed = true;
    await this.close();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async connectInternal(): Promise<void> {
    return this.retryManager.executeWithRetry(async () => {
      const token = await this.tokenManager.generateToken();

      this.client = HPKVClientFactory.createSubscriptionClient(token, this.options.apiBaseUrl, {
        maxReconnectAttempts: 5,
        maxDelayBetweenReconnects: 60000,
        jitterMs: 1000,
        initialDelayBetweenReconnects: 500,
        throttling: {
          enabled: this.options.rateLimit !== undefined,
          rateLimit: this.options.rateLimit,
        },
      });

      this.setupClientEventHandlers();
      await this.client.connect();
      this.setupSubscriptions();
    }, 'connectInternal');
  }

  private setupClientEventHandlers(): void {
    if (!this.client) return;

    const events = {
      connected: () => this.notifyConnectionListeners(ConnectionState.CONNECTED),
      disconnected: () => this.notifyConnectionListeners(ConnectionState.DISCONNECTED),
      reconnecting: () => this.notifyConnectionListeners(ConnectionState.RECONNECTING),
      reconnectFailed: () => this.notifyConnectionListeners(ConnectionState.DISCONNECTED),
      error: () => {
        this.notifyConnectionListeners(ConnectionState.DISCONNECTED);
      },
    };

    Object.entries(events).forEach(([event, handler]) => {
      this.client!.on(
        event as 'connected' | 'disconnected' | 'reconnecting' | 'reconnectFailed' | 'error',
        handler,
      );
    });

    this.cleanupCallbacks.add(() => {
      if (this.client) {
        Object.entries(events).forEach(([event, handler]) => {
          this.client!.off(
            event as 'connected' | 'disconnected' | 'reconnecting' | 'reconnectFailed' | 'error',
            handler,
          );
        });
      }
    });
  }

  private setupSubscriptions(): void {
    if (!this.client) return;

    this.subscriptionId = this.client.subscribe((data: HPKVNotificationResponse) => {
      if (!data.key || data.value === undefined) {
        return;
      }

      const keyWithoutPrefix = this.keyManager.getKeyWithoutPrefix(data.key);

      let actualValue: unknown = data.value;
      try {
        if (typeof data.value === 'string') {
          const storedValue: StoredValue = JSON.parse(data.value) as StoredValue;
          if (storedValue.clientId === this.getClientId()) {
            return;
          }
          actualValue = storedValue.value;
        }
      } catch {
        actualValue = data.value;
      }

      this.notifyChangeListeners({
        key: keyWithoutPrefix,
        value: actualValue,
        timestamp: data.timestamp,
      });
    });

    this.cleanupCallbacks.add(() => {
      if (this.client && this.subscriptionId) {
        this.client.unsubscribe(this.subscriptionId);
        this.subscriptionId = null;
      }
    });
  }

  private async handleTokenRefresh(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client.destroy();
      this.client = null;
    }
    await this.ensureConnection();
  }

  private notifyChangeListeners(event: HPKVChangeEvent): void {
    this.changeListeners.forEach(listener => {
      listener(event);
    });
  }

  private notifyConnectionListeners(state: ConnectionState): void {
    this.connectionListeners.forEach(listener => {
      listener(state);
    });
  }

  private cleanup(): void {
    this.cleanupCallbacks.forEach(cleanup => cleanup());
    this.cleanupCallbacks.clear();
    this.changeListeners.clear();
    this.connectionListeners.clear();
  }
}
