import { HPKVSubscriptionClient, ConnectionState as HPKVConnectionState } from '@hpkv/websocket-client';

export class ConnectionManager {
  private connectionState: HPKVConnectionState = HPKVConnectionState.DISCONNECTED;

  constructor(private client: HPKVSubscriptionClient | null) {}

  updateClient(client: HPKVSubscriptionClient | null): void {
    this.client = client;
  }

  updateConnectionState(state: HPKVConnectionState): void {
    this.connectionState = state;
  }

  isConnected(): boolean {
    this.connectionState = this.client?.getConnectionState() ?? HPKVConnectionState.DISCONNECTED;
    return this.connectionState === HPKVConnectionState.CONNECTED;
  }

  getConnectionState(): HPKVConnectionState {
    return this.connectionState;
  }
} 