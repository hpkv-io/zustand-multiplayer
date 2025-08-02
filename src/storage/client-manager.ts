import type { ConnectionStats } from '@hpkv/websocket-client';
import { ConnectionState } from '@hpkv/websocket-client';
import type { Logger } from '../monitoring/logger';
import { normalizeError, clearTimeoutSafely } from '../utils';
import type { HPKVStorage } from './hpkv-storage';

// ============================================================================
// Client Manager
// ============================================================================

export class ClientManager {
  private readonly connectionListeners: Array<(state: ConnectionState) => void> = [];
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly client: HPKVStorage,
    private readonly logger: Logger,
  ) {
    this.setupConnectionListener();
  }

  private setupConnectionListener(): void {
    this.client.addConnectionListener((state: ConnectionState) => {
      this.logger.info(`Connection state changed to ${state}`, {
        operation: 'connection',
        clientId: this.client.getClientId(),
      });

      if (state === ConnectionState.CONNECTED) {
        this.clearReconnectTimeout();
      }

      this.connectionListeners.forEach(listener => {
        try {
          listener(state);
        } catch (error) {
          this.logger.error('Error in connection listener', normalizeError(error), {
            operation: 'connection',
          });
        }
      });
    });
  }

  addConnectionListener(listener: (state: ConnectionState) => void): () => void {
    this.connectionListeners.push(listener);

    return () => {
      const index = this.connectionListeners.indexOf(listener);
      if (index > -1) {
        this.connectionListeners.splice(index, 1);
      }
    };
  }

  async connect(): Promise<void> {
    await this.client.ensureConnection();
  }

  async disconnect(): Promise<void> {
    this.clearReconnectTimeout();
    await this.client.close();
  }

  getConnectionState(): ConnectionState {
    return this.client.getConnectionStatus()?.connectionState ?? ConnectionState.DISCONNECTED;
  }

  getConnectionStats(): ConnectionStats | null {
    return this.client.getConnectionStatus();
  }

  private clearReconnectTimeout(): void {
    clearTimeoutSafely(this.reconnectTimeoutId);
    this.reconnectTimeoutId = null;
  }

  cleanup(): void {
    this.clearReconnectTimeout();
    this.connectionListeners.length = 0;
  }
}
