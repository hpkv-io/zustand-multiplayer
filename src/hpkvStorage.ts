import {
  HPKVSubscriptionClient,
  HPKVClientFactory,
  HPKVNotificationResponse,
  ConnectionStats,
} from '@hpkv/websocket-client';
import { MultiplayerOptions } from './multiplayer';
import { TokenHelper, TokenResponse } from './token-helper';

/**
 * Configuration options for the HPKV storage
 */
export type HPKVStorageOptions<TState> = Partial<MultiplayerOptions<TState>>;

/**
 * Change event data structure
 */
export interface HPKVChangeEvent {
  key: string;
  value: unknown;
}

/**
 * Change listener function type
 */
export type HPKVChangeListener = (event: HPKVChangeEvent) => void;

export type StoredValue = {
  value: unknown;
};

/**
 * HPKV storage implementation that provides getItem, setItem, and removeItem methods
 * using HPKVSubscriptionClient to connect to an HPKV database
 */
export class HPKVStorage<TState> {
  private client: HPKVSubscriptionClient | null = null;
  private namespace: string;
  private connected: boolean = false;
  private connecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private subscriptionId: string | null = null;
  private listeners: Set<HPKVChangeListener> = new Set();
  private cache: Map<string, any> = new Map();
  private subscribedKeys: string[] = [];
  private publishedKeys: string[] = [];

  /**
   * Gets the current connection status
   */
  public get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Creates a new HPKVStorage instance
   * @param options Configuration options
   */
  constructor(private options: Partial<MultiplayerOptions<TState>>) {
    if (!options.namespace) {
      throw new Error('namespace is required');
    }
    this.namespace = options.namespace;
    // Make sure apiKey and apiBaseUrl are provided
    if (!options.apiKey && !options.tokenGenerationUrl) {
      throw new Error('either apiKey or tokenGenerationUrl are required');
    }
  }

  /**
   * Initializes and connects the HPKV client
   * This will generate a token and create the client with access permissions
   */
  private async setupClient(): Promise<void> {
    const token = await this.generateToken();
    this.client = HPKVClientFactory.createSubscriptionClient(
      token,
      this.options.apiBaseUrl!,
      this.options.clientConfiguration,
    );

    // Subscribe to changes before connecting
    this.subscribeToChanges();

    await this.client.connect();
    this.connected = true;
  }

  /**
   * Subscribes to changes from the HPKV server
   */
  private subscribeToChanges(): void {
    if (!this.client) return;

    // Unsubscribe from previous subscription if it exists
    if (this.subscriptionId) {
      this.client.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }

    // Subscribe to all changes within our namespace
    this.subscriptionId = this.client.subscribe((data: HPKVNotificationResponse) => {
      if (!data.key || data.value === undefined) return;

      // Extract the key without namespace prefix
      const keyWithoutPrefix = data.key.slice(this.namespace.length + 1);

      try {
        const valueAsString = typeof data.value === 'string' ? data.value : String(data.value);
        const newValue: StoredValue = JSON.parse(valueAsString);
        if (newValue === null) {
          return;
        }
        const changeEvent: HPKVChangeEvent = {
          key: keyWithoutPrefix,
          value: newValue.value,
        };

        this.notifyListeners(changeEvent);
      } catch (error) {
        console.error(`Failed to process change for key ${data.key}:`, error);
      }
    });
  }

  /**
   * Notifies global listeners
   */
  private notifyListeners(event: HPKVChangeEvent): void {
    setTimeout(() => {
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in global listener:', error);
        }
      }
    }, 0);
  }

  /**
   * Adds a global listener for all changes
   * @param listener The listener function
   * @returns A function to remove the listener
   */
  public addListener(listener: HPKVChangeListener): () => void {
    this.listeners.add(listener as HPKVChangeListener);

    return () => {
      this.listeners.delete(listener as HPKVChangeListener);
    };
  }

  /**
   * Extract keys to subscribe to based on options
   */
  private ExtractSubscribedKeys(options: Partial<MultiplayerOptions<TState>>): string[] {
    const keys: string[] = [];
    if (options.subscribeToUpdatesFor) {
      const watchedKeys = options.subscribeToUpdatesFor();
      if (watchedKeys && watchedKeys.length > 0) {
        keys.push(...watchedKeys.map(key => String(key)));
      }
    }
    this.subscribedKeys = keys;
    return keys;
  }

  private ExtractPublishedKeys(options: Partial<MultiplayerOptions<TState>>): string[] {
    const keys: string[] = [];
    if (options.publishUpdatesFor) {
      const storedKeys = options.publishUpdatesFor();
      if (storedKeys && storedKeys.length > 0) {
        keys.push(...storedKeys.map(key => String(key)));
      }
    }
    this.publishedKeys = keys;
    return keys;
  }

  /**
   * Generates a WebSocket token with appropriate access permissions
   * @returns Generated token string
   */
  private async generateToken(): Promise<string> {
    const cachedToken = this.cache.get('token');
    if (cachedToken) {
      if (Date.now() - cachedToken.timestamp < Date.now()) {
        return cachedToken.token;
      } else {
        this.cache.delete('token');
      }
    }

    this.ExtractPublishedKeys(this.options);
    this.ExtractSubscribedKeys(this.options);

    if (this.options.apiKey) {
      const tokenHelper = new TokenHelper(this.options.apiKey, this.options.apiBaseUrl || '');
      const token = await tokenHelper.generateTokenForStore(
        this.namespace,
        this.subscribedKeys.map(key => this.getFullKey(key)),
      );
      this.cache.set('token', { token, timestamp: Date.now() + 1000 * 60 * 60 });
      return token;
    }
    if (this.options.tokenGenerationUrl) {
      const token = await this.fetchToken();
      this.cache.set('token', { token, timestamp: Date.now() + 1000 * 60 * 60 });
      return token;
    }
    throw new Error('either apiKey or tokenGenerationUrl are required');
  }

  private async fetchToken(): Promise<string> {
    const response = await fetch(this.options.tokenGenerationUrl || '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: this.namespace,
        subscribedKeys: this.subscribedKeys.map(key => this.getFullKey(key)),
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as TokenResponse;
    return data.token;
  }

  /**
   * Ensures connection to the HPKV server
   */
  private async ensureConnection(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    if (this.connecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connecting = true;
    this.connectionPromise = new Promise<void>((resolve, reject) => {
      if (this.connected && this.client) {
        resolve();
      }
      // Initialize client if it doesn't exist
      const initPromise = this.client ? Promise.resolve() : this.setupClient();

      initPromise
        .then(() => {
          if (!this.client) {
            throw new Error('Failed to initialize HPKV client');
          }

          // If client exists but not connected, connect it
          if (!this.connected) {
            return this.client.connect();
          }
        })
        .then(() => {
          this.connected = true;
          this.connecting = false;
          resolve();
        })
        .catch(error => {
          this.connecting = false;
          reject(error);
        });
    });

    return this.connectionPromise;
  }

  /**
   * Prefixes a key with the namespace
   * @param key Key to prefix
   */
  private getFullKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * Gets an item from storage
   * @param key Key of the item to get
   * @returns The stored value or null if not found
   */
  async getItem(key: string): Promise<unknown | null> {
    try {
      await this.ensureConnection();
      const fullKey = this.getFullKey(key);
      const response = await this.client?.get(fullKey);

      // Parse and cache the value
      const parsedValue: StoredValue = response?.value
        ? JSON.parse(response.value as string)
        : null;

      if (parsedValue !== null) {
        this.cache.set(key, parsedValue.value);
      }

      return parsedValue.value;
    } catch (error) {
      console.error(`Error getting item with key "${key}":`, error);
      return null;
    }
  }

  async getAllItems(): Promise<Map<string, unknown>> {
    await this.ensureConnection();
    const allItems = await this.client?.range(`${this.namespace}:`, `${this.namespace}:~`);
    if (!allItems) {
      return new Map();
    }

    const normalizedItems = allItems.records.map(item => ({
      key: item.key.slice(this.namespace.length + 1),
      value: JSON.parse(item.value) as StoredValue,
    }));
    const filteredItems = normalizedItems.filter(item => this.publishedKeys.includes(item.key));
    return new Map(filteredItems.map(item => [item.key, item.value.value]));
  }

  /**
   * Sets an item in storage
   * @param key Key of the item to set
   * @param value Value to store
   * @returns Promise that resolves when the item is set
   */
  async setItem(key: string, value: unknown): Promise<void> {
    try {
      if (!this.publishedKeys.includes(key)) {
        return Promise.resolve();
      }
      await this.ensureConnection();
      const fullKey = this.getFullKey(key);
      const valueToStore: StoredValue = {
        value,
      };
      const stringValue = JSON.stringify(valueToStore);
      await this.client?.set(fullKey, stringValue, true);
      this.cache.set(key, value);
    } catch (error) {
      console.error(`Error setting item with key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Removes an item from storage
   * @param key Key of the item to remove
   * @returns Promise that resolves when the item is removed
   */
  async removeItem(key: string): Promise<void> {
    try {
      await this.ensureConnection();
      const fullKey = this.getFullKey(key);
      await this.client?.delete(fullKey);
      this.cache.delete(key);
    } catch (error) {
      console.error(`Error removing item with key "${key}":`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    await this.ensureConnection();
    const allItems = await this.getAllItems();
    for (const key of allItems.keys()) {
      await this.removeItem(key);
    }
  }

  /**
   * Closes the connection to the HPKV server
   */
  async close(): Promise<void> {
    if (this.connected && this.client) {
      // Unsubscribe from changes
      if (this.subscriptionId) {
        this.client.unsubscribe(this.subscriptionId);
        this.subscriptionId = null;
      }

      await this.client.disconnect();
      this.client.destroy();
      this.connected = false;
      this.cache.clear();
      this.listeners.clear();
      this.client = null;
    }
  }

  getConnectionStatus(): ConnectionStats | null {
    return this.client?.getConnectionStats() || null;
  }
}

/**
 * Creates a new HPKVStorage instance
 * @param options Configuration options
 * @returns A new HPKVStorage instance
 */
export function createHPKVStorage<TState>(
  options: Partial<MultiplayerOptions<TState>>,
): HPKVStorage<TState> {
  return new HPKVStorage(options);
}
