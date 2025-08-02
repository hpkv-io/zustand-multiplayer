import http from 'http';
import { expect } from 'vitest';
import { TokenHelper } from '../../src/auth/token-helper';
import type { PerformanceMetrics } from '../../src/monitoring/profiler';

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

export async function waitForMetrics(
  getMetrics: () => PerformanceMetrics,
  expectedValues: Partial<PerformanceMetrics>,
  options?: { timeout?: number; interval?: number },
): Promise<void> {
  return waitFor(() => {
    const metrics = getMetrics();
    return Object.entries(expectedValues).every(([key, expectedValue]) => {
      const actualValue = metrics[key as keyof PerformanceMetrics];
      return actualValue >= expectedValue;
    });
  }, options);
}

export function createNetworkDelay(delayMs: number = 100) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

export async function expectAsyncError(
  fn: () => Promise<unknown>,
  expectedError?: string | RegExp,
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw an error');
  } catch (error) {
    if (expectedError) {
      if (typeof expectedError === 'string') {
        expect((error as Error).message).toContain(expectedError);
      } else {
        expect((error as Error).message).toMatch(expectedError);
      }
    }
    return error as Error;
  }
}

export async function simulateConcurrentExecution(
  operations: Array<() => void | Promise<void>>,
  options: {
    minDelay?: number;
    maxDelay?: number;
    randomizeOrder?: boolean;
  } = {},
): Promise<void> {
  const { minDelay = 0, maxDelay = 100, randomizeOrder = true } = options;

  const executeWithRandomDelay = async (operation: () => void | Promise<void>) => {
    const delay = Math.random() * (maxDelay - minDelay) + minDelay;
    await new Promise(resolve => setTimeout(resolve, delay));
    await Promise.resolve(operation());
  };

  const operationsToExecute = randomizeOrder
    ? [...operations].sort(() => Math.random() - 0.5)
    : operations;

  await Promise.all(operationsToExecute.map(executeWithRandomDelay));
}

export async function createStressTest(
  store1: any,
  store2: any,
  operationCount: number = 50,
  options: {
    minDelay?: number;
    maxDelay?: number;
    operations?: Array<{
      store: 'store1' | 'store2';
      method: string;
      valueGenerator: () => any;
    }>;
  } = {},
): Promise<void> {
  const { minDelay = 0, maxDelay = 200, operations = [] } = options;

  const defaultOperations = [
    {
      store: 'store1' as const,
      method: 'updateNotificationEnabled',
      valueGenerator: () => Math.random() > 0.5,
    },
    {
      store: 'store2' as const,
      method: 'updateNotificationFrequency',
      valueGenerator: () => Math.floor(Math.random() * 120) + 30,
    },
  ];

  const allOperations = operations.length > 0 ? operations : defaultOperations;
  const stressTestOperations: Promise<void>[] = [];

  for (let i = 0; i < operationCount; i++) {
    const operation = allOperations[Math.floor(Math.random() * allOperations.length)];
    const delay = Math.random() * (maxDelay - minDelay) + minDelay;

    stressTestOperations.push(
      new Promise<void>(resolve =>
        setTimeout(() => {
          const targetStore = operation.store === 'store1' ? store1 : store2;
          const method = targetStore.getState()[operation.method];
          const value = operation.valueGenerator();
          method(value);
          resolve();
        }, delay),
      ),
    );
  }

  await Promise.all(stressTestOperations);
}
