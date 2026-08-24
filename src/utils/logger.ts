export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

function write(
  level: LogLevel,
  scope: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${level.toUpperCase()}] [${scope}] ${message}${payload}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.error(line);
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, meta) => write('debug', scope, message, meta),
    info: (message, meta) => write('info', scope, message, meta),
    warn: (message, meta) => write('warn', scope, message, meta),
    error: (message, meta) => write('error', scope, message, meta),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}

const defaultLogger = createLogger('ai-backend-performance-mcp');

export function getLogger(scope?: string): Logger {
  if (!scope) {
    return defaultLogger;
  }
  return defaultLogger.child(scope);
}
