import http from 'http';
import { ConnectionState } from '@hpkv/websocket-client';
import { TokenHelper } from '../../src/auth/token-helper';
import { LogLevel } from '../../src/monitoring/logger';
import type {
  MultiplayerOptions,
  MultiplayerStoreApi,
  WithMultiplayer,
} from '../../src/types/multiplayer-types';

export const TEST_TIMEOUT = {
  SHORT: 1000,
  MEDIUM: 2000,
  LONG: 5000,
};

export async function waitForConnection<T>(
  store: MultiplayerStoreApi<WithMultiplayer<T>>,
  timeout = TEST_TIMEOUT.MEDIUM,
): Promise<void> {
  await waitFor(() => store.getState().multiplayer.connectionState === ConnectionState.CONNECTED, {
    timeout,
  });
}

export async function waitForHydration<T>(
  store: MultiplayerStoreApi<WithMultiplayer<T>>,
  timeout = TEST_TIMEOUT.MEDIUM,
): Promise<void> {
  await waitFor(() => store.getState().multiplayer.hasHydrated === true, { timeout });
}

export async function waitForDisconnection<T>(
  store: MultiplayerStoreApi<WithMultiplayer<T>>,
  timeout = TEST_TIMEOUT.MEDIUM,
): Promise<void> {
  await waitFor(
    () => store.getState().multiplayer.connectionState === ConnectionState.DISCONNECTED,
    { timeout },
  );
}

export async function waitForMultipleStores<T>(
  stores: MultiplayerStoreApi<WithMultiplayer<T>>[],
  condition: 'connected' | 'hydrated',
  timeout = TEST_TIMEOUT.LONG,
): Promise<void> {
  const promises = stores.map(store => {
    if (condition === 'connected') {
      return waitForConnection(store, timeout);
    } else {
      return waitForHydration(store, timeout);
    }
  });
  await Promise.all(promises);
}

export async function waitFor(
  callback: () => boolean | void | Promise<boolean | void>,
  options?: { timeout?: number; interval?: number },
): Promise<void> {
  const timeout = options?.timeout ?? 5000;
  const interval = options?.interval ?? 50;
  const startTime = Date.now();

  return new Promise<void>((resolve, reject) => {
    const check = async () => {
      try {
        const result = await Promise.resolve(callback());
        if (result !== false) {
          resolve();
          return;
        }
      } catch (error) {
        if (Date.now() - startTime >= timeout) {
          reject(error as Error);
          return;
        }
      }

      if (Date.now() - startTime >= timeout) {
        reject(new Error(`Timed out after ${timeout}ms waiting for condition`));
        return;
      }

      setTimeout(() => void check(), interval);
    };

    void check();
  });
}

export function getTestMultiplayerOptions<T>(
  overrides?: Partial<MultiplayerOptions<T>>,
): Partial<MultiplayerOptions<T>> {
  return {
    logLevel: LogLevel.DEBUG,
    rateLimit: 40,
    apiKey: process.env.HPKV_API_KEY,
    apiBaseUrl: process.env.HPKV_API_BASE_URL,
    ...overrides,
  };
}

export async function createTestServer(apiKey: string, apiBaseUrl: string) {
  const tokenHelper = new TokenHelper(apiKey, apiBaseUrl);

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/generate-token') {
      let body: string = '';

      req.on('data', (chunk: { toString: () => string }) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        tokenHelper
          .processTokenRequest(body)
          .then(token => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(token));
          })
          .catch(error => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({ error: `Failed to generate token: ${(error as Error).message}` }),
            );
          });
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const serverInfo = await new Promise<{ server: http.Server; serverUrl: string }>(resolve => {
    server.listen(0, 'localhost', () => {
      const addr = server.address() as { port: number };
      const serverUrl = `http://localhost:${addr.port}/generate-token`;
      resolve({ server, serverUrl });
    });
  });

  return serverInfo;
}

export function createUniqueStoreName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}
