// Logger implementation

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogContext {
  clientId?: string;
  operation?: string;
  timestamp: number;
  // Extended properties for enhanced debugging
  [key: string]: unknown;
}

export class Logger {
  constructor(private level: LogLevel = LogLevel.INFO) {
    if (level < LogLevel.DEBUG || level > LogLevel.NONE) {
      this.level = LogLevel.INFO;
    } else {
      this.level = level;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, context: LogContext): string {
    const timestamp = new Date(context.timestamp).toISOString();
    const clientId = context.clientId ? `[${context.clientId}]` : '';
    const operation = context.operation ? `(${context.operation})` : '';
    return `${timestamp} ${level} ${clientId}${operation}: ${message}`;
  }

  debug(message: string, context: Partial<LogContext> = {}): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', message, { timestamp: Date.now(), ...context }));
    }
  }

  info(message: string, context: Partial<LogContext> = {}): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message, { timestamp: Date.now(), ...context }));
    }
  }

  warn(message: string, context: Partial<LogContext> = {}): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, { timestamp: Date.now(), ...context }));
    }
  }

  error(message: string, error?: Error, context: Partial<LogContext> = {}): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorMessage = error ? `${message}: ${error.message}` : message;
      console.error(
        this.formatMessage('ERROR', errorMessage, { timestamp: Date.now(), ...context }),
      );
      if (error?.stack) {
        console.error(error.stack);
      }
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }
}

/**
 * Creates a new logger instance with the specified log level
 * @param level The log level for the logger
 * @returns A new Logger instance
 */
export function createLogger(level: LogLevel = LogLevel.INFO): Logger {
  return new Logger(level);
}
