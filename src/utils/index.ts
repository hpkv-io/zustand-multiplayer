/**
 * Generates a unique identifier with timestamp and random component
 * @returns A unique string identifier
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generates a unique client identifier
 * @returns A unique client identifier string
 */
export function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Normalizes an error to ensure it's an Error instance
 * @param error The error to normalize
 * @returns A normalized Error instance
 */
export function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Gets the current timestamp in milliseconds
 * @returns Current timestamp
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Creates a delay promise
 * @param ms Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export function createDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a timeout promise that resolves after the specified time
 * @param ms Milliseconds to wait
 * @returns Promise that resolves after timeout
 */
export function createTimeout(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Safely clears a timeout
 * @param timeoutId The timeout ID to clear
 */
export function clearTimeoutSafely(timeoutId: ReturnType<typeof setTimeout> | null): void {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
}

/**
 * Escapes special characters in a string for use in a regular expression
 * @param string The string to escape
 * @returns The escaped string
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Creates a generic handler function for framework-specific token handlers
 * @param processRequest Function that processes the token request
 * @returns Handler function that can be adapted for different frameworks
 */
export function createGenericHandler<TRequest, TResponse>(
  processRequest: (requestData: unknown) => Promise<TResponse>
) {
  return {
    // Express/Connect style handler
    express: () => async (req: any, res: any) => {
      try {
        const response = await processRequest(req.body);
        res.json(response);
      } catch (error) {
        const message = normalizeError(error).message;
        res.status(400).json({ error: message });
      }
    },
    
    // Next.js API handler
    nextjs: () => async (req: any, res: any) => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        const response = await processRequest(req.body);
        res.status(200).json(response);
      } catch (error) {
        const message = normalizeError(error).message;
        res.status(400).json({ error: message });
      }
    },
    
    // Fastify handler
    fastify: () => async (request: any, reply: any) => {
      try {
        const response = await processRequest(request.body);
        return reply.send(response);
      } catch (error) {
        const message = normalizeError(error).message;
        return reply.code(400).send({ error: message });
      }
    },
  };
} 