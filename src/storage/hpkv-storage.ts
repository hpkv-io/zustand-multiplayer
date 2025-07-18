import {
  HPKVSubscriptionClient,
  HPKVClientFactory,
  HPKVNotificationResponse,
  ConnectionStats,
  ConnectionState as HPKVConnectionState,
  ConnectionConfig,
} from '@hpkv/websocket-client';
import { TokenManager } from '../auth/token-manager';
import { OperationTracker, createOperationTracker } from '../core/operation-tracker';
import { Logger } from '../monitoring/logger';
import { BrowserConnectivityManager } from '../network/connectivity-manager';
import { RetryConfig, RetryManager, createRetryManager } from '../network/retry';
import { generateClientId, normalizeError, getCurrentTimestamp } from '../utils';
import { ConnectionManager } from './connection-manager';
import { StorageKeyManager } from './storage-key-manager';

export interface HPKVChangeEvent {
  key: string;
  value: unknown;
}

export type HPKVChangeListener = (event: HPKVChangeEvent) => void;
export type HPKVConnectionListener = (connectionState: HPKVConnectionState) => void;

export type StoredValue = {
  value: unknown;
  clientId?: string;
  timestamp?: number;
};

export interface HPKVStorageOptions {
  namespace: string;
  apiBaseUrl: string;
  apiKey?: string;
  tokenGenerationUrl?: string;
  clientConfig?: ConnectionConfig;
  retryConfig?: RetryConfig;
}

/**
 * Interface for the High-Performance Key-Value (HPKV) storage.
 * This defines the contract for interacting with the underlying storage mechanism,
 * handling data synchronization, connection management, and change notifications.
 */
export interface HPKVStorage {
  /**
   * Gets the unique client ID for this instance
   * @returns The client ID
   */
  getClientId(): string;

  /**
   * Adds a listener for changes to items in the storage.
   * @param listener - The function to call when an item changes.
   * @returns A function to remove the listener.
   */
  addChangeListener(listener: (event: HPKVChangeEvent) => void): () => void;

  /**
   * Adds a listener for changes in the connection state.
   * @param listener - The function to call when the connection state changes.
   * @returns A function to remove the listener.
   */
  addConnectionListener(listener: (state: HPKVConnectionState) => void): () => void;

  /**
   * Ensures that the connection to the storage is active.
   * @returns A promise that resolves when the connection is established.
   */
  ensureConnection(): Promise<void>;

  /**
   * Closes the connection to the storage.
   * @returns A promise that resolves when the connection is closed.
   */
  close(): Promise<void>;

  /**
   * Gets the current connection status and statistics.
   * @returns The connection statistics, or null if not connected.
   */
  getConnectionStatus(): ConnectionStats | null;

  /**
   * Retrieves all items from the storage.
   * @returns A promise that resolves with a map of all key-value pairs.
   */
  getAllItems(): Promise<Map<string, unknown>>;

  /**
   * Sets the value for a specific key in the storage.
   * @param key - The key of the item to set.
   * @param value - The value of the item.
   * @returns A promise that resolves when the item is set.
   */
  setItem(key: string, value: unknown): Promise<void>;

  /**
   * Removes the value for a specific key in the storage.
   * @param key - The key of the item to remove.
   * @returns A promise that resolves when the item is removed.
   */
  removeItem(key: string): Promise<void>;

  /**
   * Clears all items from the storage.
   * @returns A promise that resolves when the storage is cleared.
   */
  clear(): Promise<void>;

  /**
   * Destroys the storage client, cleaning up all resources.
   * @returns A promise that resolves when the client is destroyed.
   */
  destroy(): Promise<void>;
}

/**
 * HPKV storage implementation that provides getItem, setItem, and removeItem methods
 * using HPKVSubscriptionClient to connect to an HPKV database
 */
class HPKVStorageImpl implements HPKVStorage {
  private client: HPKVSubscriptionClient | null = null;
  private namespace: string;
  private connectionManager: ConnectionManager;
  private connecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private subscriptionId: string | null = null;
  private changeListeners: Set<HPKVChangeListener> = new Set();
  private connectionListeners: Set<HPKVConnectionListener> = new Set();
  private tokenManager: TokenManager;
  private readonly subscribedKeys: string[];
  private readonly publishedKeys: string[];
  private readonly clientId: string;
  private logger: Logger;
  private cleanupCallbacks: Set<() => void> = new Set();
  private isDestroyed: boolean = false;
  private retryManager: RetryManager;
  private storageOptions: HPKVStorageOptions;
  private operationTracker: OperationTracker;
  private connectivityManager: BrowserConnectivityManager;
  private keyManager: StorageKeyManager;

  public get isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  /**
   * Creates a new HPKVStorageImpl instance
   * @param storageOptions Configuration options for the storage client.
   * @param subscribedKeys A list of keys the client should subscribe to for updates.
   * @param publishedKeys A list of keys the client has permission to publish updates for.
   * @param logger An instance of the logger.
   */
  constructor(
    storageOptions: HPKVStorageOptions,
    subscribedKeys: string[],
    publishedKeys: string[],
    logger: Logger,
  ) {
    if (!storageOptions.namespace) {
      throw new Error('namespace is required');
    }

    this.storageOptions = storageOptions;
    this.namespace = storageOptions.namespace;
    this.subscribedKeys = subscribedKeys;
    this.publishedKeys = publishedKeys;
    this.logger = logger;
    this.clientId = generateClientId();
    this.retryManager = createRetryManager(this.logger, storageOptions.retryConfig);
    this.connectionManager = new ConnectionManager(null);
    this.operationTracker = createOperationTracker();
    this.connectivityManager = new BrowserConnectivityManager();
    this.keyManager = new StorageKeyManager(this.namespace);

    // Initialize token manager
    this.tokenManager = new TokenManager({
      namespace: this.namespace,
      apiBaseUrl: this.storageOptions.apiBaseUrl,
      apiKey: this.storageOptions.apiKey,
      tokenGenerationUrl: this.storageOptions.tokenGenerationUrl,
      subscribedKeys: this.subscribedKeys,
      keyManager: this.keyManager,
      retryManager: this.retryManager,
      logger: this.logger,
      clientId: this.clientId,
    });

    this.tokenManager.setTokenRefreshCallback(async () => {
      if (this.connectionManager.isConnected() && this.client) {
        await this.client.disconnect();
        this.client.destroy();
        this.client = null;
        this.connectionManager.updateClient(null);
        this.connectionManager.updateConnectionState(HPKVConnectionState.DISCONNECTED);
      }
      await this.ensureConnection();
    });

    this.setupConnectivityHandling();
  }

  private setupConnectivityHandling(): void {
    const cleanup = this.connectivityManager.addListener((isOnline: boolean) => {
      if (isOnline) {
        this.handleBrowserOnline();
      } else {
        this.handleBrowserOffline();
      }
    });

    this.registerCleanup(cleanup);
  }

  private handleBrowserOnline(): void {
    this.ensureConnection().catch(error => {
      this.logger.error('Failed to reconnect after coming online', normalizeError(error), {
        operation: 'online-reconnect',
        clientId: this.clientId,
      });
    });
  }

  private handleBrowserOffline(): void {
    this.connectionManager.updateConnectionState(HPKVConnectionState.DISCONNECTED);
    this.notifyConnectionListeners(HPKVConnectionState.DISCONNECTED);
  }

  private async setupClient(): Promise<void> {
    this.checkDestroyed();
    return this.retryManager.executeWithRetry(async () => {
      const token = await this.tokenManager.generateToken();
      this.client = HPKVClientFactory.createSubscriptionClient(
        token,
        this.storageOptions.apiBaseUrl!,
        this.storageOptions.clientConfig,
      );
      this.connectionManager.updateClient(this.client);

      this.subscribeToChanges();
      this.subscribeToConnection();
      await this.client.connect();

      this.connectionManager.updateConnectionState(HPKVConnectionState.CONNECTED);
    }, 'setupClient');
  }

  private subscribeToConnection(): void {
    if (!this.client) return;

    const onConnected = () => {
      this.connectionManager.updateConnectionState(HPKVConnectionState.CONNECTED);
      this.notifyConnectionListeners(HPKVConnectionState.CONNECTED);
    };

    const onDisconnected = () => {
      this.connectionManager.updateConnectionState(HPKVConnectionState.DISCONNECTED);
      this.notifyConnectionListeners(HPKVConnectionState.DISCONNECTED);
    };

    const onReconnecting = () => {
      this.connectionManager.updateConnectionState(HPKVConnectionState.RECONNECTING);
      this.notifyConnectionListeners(HPKVConnectionState.RECONNECTING);
    };

    const onReconnectFailed = () => {
      this.connectionManager.updateConnectionState(HPKVConnectionState.DISCONNECTED);
      this.notifyConnectionListeners(HPKVConnectionState.DISCONNECTED);
    };

    const onError = () => {
      this.logger.debug('Error in connection', {
        operation: 'connection-error',
        clientId: this.clientId,
      });
      this.connectionManager.updateConnectionState(HPKVConnectionState.DISCONNECTED);
      this.notifyConnectionListeners(HPKVConnectionState.DISCONNECTED);
    };

    this.client.on('connected', onConnected);
    this.client.on('disconnected', onDisconnected);
    this.client.on('reconnecting', onReconnecting);
    this.client.on('reconnectFailed', onReconnectFailed);
    this.client.on('error', onError);

    this.registerCleanup(() => {
      if (this.client) {
        this.client.off('connected', onConnected);
        this.client.off('disconnected', onDisconnected);
        this.client.off('reconnecting', onReconnecting);
        this.client.off('reconnectFailed', onReconnectFailed);
        this.client.off('error', onError);
      }
    });
  }

  private subscribeToChanges(): void {
    if (!this.client) return;

    if (this.subscriptionId) {
      this.client.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }
    this.subscriptionId = this.client.subscribe((data: HPKVNotificationResponse) => {
      if (!data.key || data.value === undefined) {
        return;
      }

      const keyWithoutPrefix = this.keyManager.getKeyWithoutPrefix(data.key);

      try {
        const valueAsString = typeof data.value === 'string' ? data.value : String(data.value);
        const newValue: StoredValue = JSON.parse(valueAsString);

        if (newValue && newValue.clientId && newValue.clientId === this.clientId) {
          return;
        }

        const changeEvent: HPKVChangeEvent = {
          key: keyWithoutPrefix,
          value: newValue?.value ?? null,
        };
        this.notifyChangeListeners(changeEvent);
      } catch (error) {
        this.logger.error(`Failed to process change for key ${data.key}`, normalizeError(error), {
          operation: 'change-processing',
          clientId: this.clientId,
        });
      }
    });

    this.registerCleanup(() => {
      if (this.client && this.subscriptionId) {
        this.client.unsubscribe(this.subscriptionId);
        this.subscriptionId = null;
      }
    });
  }

  private notifyChangeListeners(event: HPKVChangeEvent): void {
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error('Error in global listener', normalizeError(error), {
          operation: 'change-listener',
          clientId: this.clientId,
        });
      }
    }
  }

  private notifyConnectionListeners(state: HPKVConnectionState): void {
    for (const listener of this.connectionListeners) {
      try {
        listener(state);
      } catch (error) {
        this.logger.error('Error in connection listener', normalizeError(error), {
          operation: 'connection-listener',
          clientId: this.clientId,
        });
      }
    }
  }

  public addChangeListener(listener: HPKVChangeListener): () => void {
    this.changeListeners.add(listener);

    return () => {
      this.changeListeners.delete(listener);
    };
  }

  public addConnectionListener(listener: HPKVConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  async ensureConnection(): Promise<void> {
    this.checkDestroyed();

    if (!this.connectivityManager.getIsOnline()) {
      this.logger.warn('Attempting to connect while browser appears offline', {
        operation: 'ensureConnection',
        clientId: this.clientId,
      });
    }

    // Use optimized connection check
    if (this.connectionManager.isConnected() && this.client) {
      return;
    }

    if (this.connecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connecting = true;
    this.connectionPromise = this.retryManager
      .executeWithRetry(async () => {
        if (this.connectionManager.isConnected() && this.client) {
          return;
        }

        // Initialize client if it doesn't exist
        const initPromise = this.client ? Promise.resolve() : this.setupClient();

        await initPromise;

        if (!this.client) {
          throw new Error('Failed to initialize HPKV client');
        }

        // If client exists but not connected, connect it
        const currentState = this.client.getConnectionState();
        if (currentState !== HPKVConnectionState.CONNECTED) {
          await this.client.connect();
        }

        this.connectionManager.updateConnectionState(HPKVConnectionState.CONNECTED);
      }, 'ensureConnection')
      .finally(() => {
        this.connecting = false;
        this.connectionPromise = null;
      });

    return this.connectionPromise;
  }

  private async waitForOperations(timeoutMs: number = 5000): Promise<void> {
    await this.operationTracker.waitForOperations(timeoutMs);
  }

  async getAllItems(): Promise<Map<string, unknown>> {
    this.checkDestroyed();
    const operation = async (): Promise<Map<string, unknown>> => {
      return this.retryManager.executeWithRetry(async () => {
        const range = this.keyManager.getNamespaceRange();
        let allRecords: any[] = [];
        let currentStart = range.start;
        let hasMore = true;

        // Keep fetching until all keys are retrieved
        while (hasMore) {
          const batchResult = await this.client?.range(currentStart, range.end, { limit: 100 });

          if (!batchResult || !batchResult.records || batchResult.records.length === 0) {
            hasMore = false;
            break;
          }

          allRecords = allRecords.concat(batchResult.records);

          // Check if there are more results
          if (batchResult.truncated) {
            // Use the last key from this batch as the starting point for the next call
            // We need to increment beyond the last key to avoid duplicates
            const lastKey = batchResult.records[batchResult.records.length - 1].key;
            currentStart = lastKey + '\0'; // Add null character to get the next key
          } else {
            hasMore = false;
          }
        }

        const normalizedItems = allRecords.map(item => ({
          key: this.keyManager.getKeyWithoutPrefix(item.key),
          value: JSON.parse(item.value) as StoredValue,
        }));

        const filteredItems = this.keyManager.filterItemsByPublishedKeys(
          normalizedItems,
          this.publishedKeys,
        );

        return new Map(filteredItems.map(item => [item.key, item.value.value]));
      }, 'getAllItems');
    };

    return this.operationTracker.trackOperation(operation());
  }

  async setItem(key: string, value: unknown): Promise<void> {
    this.checkDestroyed();

    const operation = async (): Promise<void> => {
      const logicalKey = this.keyManager.extractLogicalKey(key);
      const isAllowed = this.keyManager.isKeyAllowedToPublish(logicalKey, this.publishedKeys);

      if (!isAllowed) {
        return Promise.resolve();
      }

      const fullKey = this.keyManager.ensureNamespacePrefix(key);
      const valueToStore: StoredValue = {
        value,
        clientId: this.clientId,
        timestamp: getCurrentTimestamp(),
      };
      const stringValue = JSON.stringify(valueToStore);
      this.logger.debug(`Setting item: ${fullKey}`, {
        operation: 'setItem',
        clientId: this.clientId,
      });
      await this.client?.set(fullKey, stringValue, true).catch(error => {
        this.logger.error('Failed to set item', normalizeError(error), {
          operation: 'setItem',
          clientId: this.clientId,
        });
      });
    };

    return this.operationTracker.trackOperation(operation());
  }

  async removeItem(key: string): Promise<void> {
    this.checkDestroyed();
    const operation = async (): Promise<void> => {
      return this.retryManager.executeWithRetry(async () => {
        const fullKey = this.keyManager.ensureNamespacePrefix(key);
        await this.client?.delete(fullKey);
        this.logger.debug(`Removed item from storage. key: ${fullKey}`, {
          operation: 'removeItem',
          clientId: this.clientId,
        });
      }, `removeItem-${key}`);
    };

    return this.operationTracker.trackOperation(operation());
  }

  async clear(): Promise<void> {
    this.checkDestroyed();
    const operation = async (): Promise<void> => {
      await this.ensureConnection();
      const range = this.keyManager.getNamespaceRange();
      let currentStart = range.start;
      let hasMore = true;

      while (hasMore) {
        const batchResult = await this.client?.range(currentStart, range.end, { limit: 100 });

        if (!batchResult || !batchResult.records || batchResult.records.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of batchResult.records) {
          await this.retryManager.executeWithRetry(async () => {
            await this.client?.delete(item.key);
          }, `clear-${item.key}`);
        }

        if (batchResult.truncated) {
          const lastKey = batchResult.records[batchResult.records.length - 1].key;
          currentStart = lastKey + '\0';
        } else {
          hasMore = false;
        }
      }
    };

    return this.operationTracker.trackOperation(operation());
  }

  async close(): Promise<void> {
    this.tokenManager.clear();

    await this.waitForOperations();
    if (this.connectionManager.isConnected() && this.client) {
      if (this.subscriptionId) {
        this.client.unsubscribe(this.subscriptionId);
        this.subscriptionId = null;
      }
      const currentState = this.client.getConnectionStats()?.connectionState;
      if (currentState === HPKVConnectionState.CONNECTED) {
        await this.client.disconnect();
      }
      this.client.destroy();
      this.client = null;
      this.connectionManager.updateClient(null);
      this.connectionManager.updateConnectionState(HPKVConnectionState.DISCONNECTED);
    }
  }

  getConnectionStatus(): ConnectionStats | null {
    const clientStats = this.client?.getConnectionStats();
    if (clientStats) {
      return clientStats;
    }

    return {
      isConnected: false,
      reconnectAttempts: 0,
      messagesPending: 0,
      connectionState: this.connectionManager.getConnectionState(),
      queueSize: 0,
    } as ConnectionStats;
  }

  public getClientId(): string {
    return this.clientId;
  }

  registerCleanup(callback: () => void): void {
    this.cleanupCallbacks.add(callback);
  }

  async destroy(): Promise<void> {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    for (const cleanup of this.cleanupCallbacks) {
      try {
        cleanup();
      } catch (error) {
        this.logger.error('Cleanup callback failed', normalizeError(error), {
          operation: 'cleanup',
          clientId: this.clientId,
        });
      }
    }

    this.cleanupCallbacks.clear();
    await this.close();

    this.connectivityManager.destroy();
  }

  private checkDestroyed(): void {
    if (this.isDestroyed) {
      throw new Error('HPKVStorage instance has been destroyed');
    }
  }
}

/**
 * Creates a new HPKVStorage instance
 * @param storageOptions Configuration options for the storage client.
 * @param subscribedKeys A list of keys the client should subscribe to for updates.
 * @param publishedKeys A list of keys the client has permission to publish updates for.
 * @param logger An instance of the logger.
 * @returns A new HPKVStorage instance.
 */
export function createHPKVStorage(
  storageOptions: HPKVStorageOptions,
  subscribedKeys: string[],
  publishedKeys: string[],
  logger: Logger,
): HPKVStorage {
  return new HPKVStorageImpl(storageOptions, subscribedKeys, publishedKeys, logger);
}
