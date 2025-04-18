// Define Console-like interface with common methods
interface LoggerInterface {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  [key: string]: unknown;
}

// Use console as the default logger with type assertion
let currentLogger: LoggerInterface = console as unknown as LoggerInterface;

export const logger = new Proxy<LoggerInterface>({} as LoggerInterface, {
  get: function (_target, prop: string | symbol, _receiver) {
    if (typeof prop === 'string' && prop in currentLogger) {
      const method = currentLogger[prop];
      if (typeof method === 'function') {
        return method.bind(currentLogger);
      }
    }
    return undefined;
  },
});

export function setLogger(newLogger: LoggerInterface): void {
  currentLogger = newLogger;
}
