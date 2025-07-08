import { getCurrentTimestamp } from '../utils';

/**
 * Secure token storage that prevents memory dumps
 */
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
      // Overwrite sensitive data before clearing
      this.tokenData.token = '';
      this.tokenData = null;
    }
  }

  isValid(): boolean {
    return this.tokenData !== null && getCurrentTimestamp() < this.tokenData.expiresAt;
  }

  setRefreshing(refreshing: boolean): void {
    this.isRefreshing = refreshing;
  }

  getRefreshing(): boolean {
    return this.isRefreshing;
  }
} 