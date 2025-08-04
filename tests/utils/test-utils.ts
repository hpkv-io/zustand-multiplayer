import http from 'http';
import { TokenHelper } from '../../src/auth/token-helper';

export async function waitFor(
  callback: () => boolean | void | Promise<boolean | void>,
  options?: { timeout?: number; interval?: number },
): Promise<void> {
  const timeout = options?.timeout ?? 2000;
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
            res.end(JSON.stringify({ error: 'Failed to generate token' }));
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
