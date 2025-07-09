import http from 'http';
import { expect } from 'vitest';
import { TokenHelper } from '../../src/auth/token-helper';
import { PerformanceMetrics } from '../../src/monitoring/profiler';

// Helper function to wait for conditions
export async function waitFor(
  callback: () => boolean | void | Promise<boolean | void>,
  options?: { timeout?: number; interval?: number },
): Promise<void> {
  const timeout = options?.timeout || 2000;
  const interval = options?.interval || 50;
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
          reject(error);
          return;
        }
        // Otherwise, continue retrying
      }

      if (Date.now() - startTime >= timeout) {
        reject(new Error(`Timed out after ${timeout}ms waiting for condition`));
        return;
      }

      setTimeout(check, interval);
    };

    check();
  });
}

/**
 * Creates a test HTTP server that handles token generation requests for tests
 * @param apiKey HPKV API key
 * @param apiBaseUrl HPKV API base URL
 * @returns Object containing the server and the server URL
 */
export async function createTestServer(apiKey: string, apiBaseUrl: string) {
  const tokenHelper = new TokenHelper(apiKey, apiBaseUrl);

  const server = http.createServer(async (req, res) => {
    // Add CORS headers to prevent connection issues
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS request (preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only handle POST requests to /generate-token
    if (req.method === 'POST' && req.url === '/generate-token') {
      let body = '';

      // Collect request body
      req.on('data', chunk => {
        body += chunk.toString();
      });

      // Process the request
      req.on('end', async () => {
        try {
          console.log('Token generation request received:', body);
          const token = await tokenHelper.processTokenRequest(body);
          console.log(`Token generated successfully for ${token.namespace}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(token));
        } catch (error) {
          console.error('Error generating token:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to generate token' }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  // Start the server on a random port
  const serverInfo = await new Promise<{ server: http.Server; serverUrl: string }>(resolve => {
    server.listen(0, 'localhost', () => {
      const addr = server.address() as { port: number };
      const serverUrl = `http://localhost:${addr.port}/generate-token`;
      console.log(`Test server running at ${serverUrl}`);
      resolve({ server, serverUrl });
    });
  });

  return serverInfo;
}

/**
 * Creates a unique store name to prevent test interference
 */
export function createUniqueStoreName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Helper to wait for performance metrics to reach expected values
 */
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

/**
 * Helper to simulate network delays for testing reconnection logic
 */
export function createNetworkDelay(delayMs: number = 100) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Helper to validate conflict resolution behavior
 */
export function validateConflictResolution(
  conflicts: any[],
  strategy: 'keep-remote' | 'keep-pending' | 'merge',
  expectedResult?: any,
) {
  expect(conflicts).toBeDefined();
  expect(Array.isArray(conflicts)).toBe(true);

  if (strategy === 'merge' && expectedResult) {
    // Additional validation for merge strategy can be added here
    expect(expectedResult).toBeDefined();
  }
}

/**
 * Helper to test error scenarios
 */
export async function expectAsyncError(
  fn: () => Promise<any>,
  expectedError?: string | RegExp,
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw an error');
  } catch (error) {
    if (expectedError) {
      if (typeof expectedError === 'string') {
        expect(error.message).toContain(expectedError);
      } else {
        expect(error.message).toMatch(expectedError);
      }
    }
    return error as Error;
  }
}
