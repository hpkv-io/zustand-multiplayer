import type { Logger } from '../monitoring/logger';
import type { StorageKeyManager } from '../storage/storage-key-manager';
import { clearTimeoutSafely } from '../utils';
import { TOKEN_EXPIRY_TIME, TOKEN_REFRESH_BUFFER } from '../utils/constants';
import type { RetryManager } from '../utils/retry';
import type { TokenResponse } from './token-helper';
import { TokenHelper } from './token-helper';

export interface TokenGenerationOptions {
  namespace: string;
  apiBaseUrl: string;
  apiKey?: string;
  tokenGenerationUrl?: string;
  subscribedKeys: string[];
  keyManager: StorageKeyManager;
  retryManager: RetryManager;
  logger: Logger;
  clientId: string;
}

export class SecureTokenCache {
  private tokenData: { token: string; expiresAt: number } | null = null;
  private isRefreshing: boolean = false;

  set(token: string, expiresAt: number): void {
    this.tokenData = { token, expiresAt };
  }

  get(): { token: string; expiresAt: number } | null {
    return this.tokenData;
  }

  clear(): void {
    if (this.tokenData) {
      // Secure token clearing - overwrite with random data before nullifying
      const tokenLength = this.tokenData.token.length;
      this.tokenData.token = Array(tokenLength)
        .fill(0)
        .map(() => Math.random().toString(36).charAt(0))
        .join('');
      this.tokenData.token = '';
      this.tokenData = null;
    }
  }

  isValid(): boolean {
    return this.tokenData !== null && Date.now() < this.tokenData.expiresAt;
  }

  setRefreshing(refreshing: boolean): void {
    this.isRefreshing = refreshing;
  }

  getRefreshing(): boolean {
    return this.isRefreshing;
  }
}

/**
 * token manager - handles token generation, caching, and refresh
 */
export class TokenManager {
  private readonly secureTokenCache: SecureTokenCache = new SecureTokenCache();
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenRefreshPromise: Promise<string> | null = null;
  private readonly options: TokenGenerationOptions;
  private onTokenRefresh?: () => Promise<void>;

  constructor(options: TokenGenerationOptions) {
    this.options = options;
  }

  /**
   * Sets a callback to be called when token refresh is needed
   */
  setTokenRefreshCallback(callback: () => Promise<void>): void {
    this.onTokenRefresh = callback;
  }

  /**
   * Generates a WebSocket token with appropriate access permissions
   * Thread-safe with race condition protection
   * @returns Generated token string
   */
  async generateToken(): Promise<string> {
    if (this.secureTokenCache.isValid()) {
      const cached = this.secureTokenCache.get();
      return cached!.token;
    }

    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.secureTokenCache.setRefreshing(true);
    this.tokenRefreshPromise = this.performTokenGeneration();

    try {
      const token = await this.tokenRefreshPromise;
      return token;
    } finally {
      this.secureTokenCache.setRefreshing(false);
      this.tokenRefreshPromise = null;
    }
  }

  /**
   * Performs the actual token generation logic
   */
  private async performTokenGeneration(): Promise<string> {
    this.secureTokenCache.clear();
    this.clearTokenRefreshTimer();

    let token: string;

    if (this.options.apiKey) {
      const tokenHelper = new TokenHelper(this.options.apiKey, this.options.apiBaseUrl);
      const fullSubscribedKeys = this.options.subscribedKeys.map(key =>
        this.options.keyManager.getFullKey(key),
      );
      token = await tokenHelper.generateTokenForStore(
        this.options.keyManager.getNamespace(),
        fullSubscribedKeys,
      );
    } else if (this.options.tokenGenerationUrl) {
      token = await this.fetchToken();
    } else {
      throw new Error('either apiKey or tokenGenerationUrl are required');
    }

    // Cache token with configured expiry time
    const expiresAt = Date.now() + TOKEN_EXPIRY_TIME;
    this.secureTokenCache.set(token, expiresAt);

    // Schedule refresh with configured buffer time before expiry
    const refreshAt = expiresAt - TOKEN_REFRESH_BUFFER;
    const refreshDelay = refreshAt - Date.now();

    if (refreshDelay > 0) {
      this.tokenRefreshTimer = setTimeout(() => {
        this.refreshToken().catch(() => {
          // Ignore refresh errors
        });
      }, refreshDelay);
    }

    return token;
  }

  /**
   * Proactively refreshes the token and reconnects if needed
   * Protected against race conditions
   */
  private async refreshToken(): Promise<void> {
    if (this.secureTokenCache.getRefreshing()) {
      return;
    }

    if (this.onTokenRefresh) {
      await this.onTokenRefresh();
    }
  }

  /**
   * Clears the token refresh timer
   */
  private clearTokenRefreshTimer(): void {
    clearTimeoutSafely(this.tokenRefreshTimer);
    this.tokenRefreshTimer = null;
  }

  /**
   * Fetches token from a custom token generation URL
   */
  private async fetchToken(): Promise<string> {
    return this.options.retryManager.executeWithRetry(async () => {
      const response = await fetch(this.options.tokenGenerationUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace: this.options.keyManager.getNamespace(),
          subscribedKeysAndPatterns: this.options.subscribedKeys.map(key =>
            this.options.keyManager.getFullKey(key),
          ),
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as TokenResponse;
      return data.token;
    }, 'fetchToken');
  }

  /**
   * Clears the token cache and stops refresh timers
   */
  clear(): void {
    this.clearTokenRefreshTimer();
    this.secureTokenCache.clear();
  }

  /**
   * Gets the current token if valid
   */
  getCurrentToken(): string | null {
    if (this.secureTokenCache.isValid()) {
      const cached = this.secureTokenCache.get();
      return cached?.token ?? null;
    }
    return null;
  }

  /**
   * Checks if a token refresh is currently in progress
   */
  isRefreshing(): boolean {
    return this.secureTokenCache.getRefreshing();
  }
}
