/**
 * Generic HTTP request interface
 */
export interface HttpRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[]>;
}

/**
 * Generic HTTP response interface
 */
export interface HttpResponse<T = unknown> {
  status(code: number): HttpResponse<T>;
  json(data: T): HttpResponse<T> | void;
  send(data: T): HttpResponse<T> | void;
  code(statusCode: number): HttpResponse<T>;
}

/**
 * Express-style request/response interfaces
 */
export interface ExpressRequest extends HttpRequest {
  body: unknown;
}

export interface ExpressResponse extends HttpResponse {
  status(code: number): ExpressResponse;
  json(data: unknown): void;
}

/**
 * Next.js API request/response interfaces
 */
export interface NextApiRequest extends HttpRequest {
  method: string;
  body: unknown;
}

export interface NextApiResponse extends HttpResponse {
  status(code: number): NextApiResponse;
  json(data: unknown): void;
}

/**
 * Fastify request/reply interfaces
 */
export interface FastifyRequest extends HttpRequest {
  body: unknown;
}

export interface FastifyReply extends HttpResponse {
  code(statusCode: number): FastifyReply;
  send(data: unknown): FastifyReply;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  error: string;
}

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
 * Type guard to check if a value is a plain object
 * @param value The value to check
 * @returns True if the value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard to check if a value is a primitive
 */
export function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Creates a generic handler function for framework-specific token handlers
 * @param processRequest Function that processes the token request
 * @returns Handler function that can be adapted for different frameworks
 */
export function createGenericHandler<TResponse>(
  processRequest: (requestData: unknown) => Promise<TResponse>,
) {
  return {
    // Express/Connect style handler
    express: () => async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const response = await processRequest(req.body);
        res.json(response);
      } catch (error) {
        const message = normalizeError(error).message;
        res.status(400).json({ error: message } as ErrorResponse);
      }
    },

    // Next.js API handler
    nextjs: () => async (req: NextApiRequest, res: NextApiResponse) => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' } as ErrorResponse);
        }
        const response = await processRequest(req.body);
        res.status(200).json(response);
      } catch (error) {
        const message = normalizeError(error).message;
        res.status(400).json({ error: message } as ErrorResponse);
      }
    },

    // Fastify handler
    fastify: () => async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const response = await processRequest(request.body);
        return reply.send(response);
      } catch (error) {
        const message = normalizeError(error).message;
        return reply.code(400).send({ error: message } as ErrorResponse);
      }
    },
  };
}
