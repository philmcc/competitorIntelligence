type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  userId?: number;
  path?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  timestamp?: string;
  environment?: string;
  [key: string]: any;
}

class Logger {
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const requestId = context?.requestId ? `[${context.requestId}]` : '';
    const userId = context?.userId ? `[User:${context.userId}]` : '';
    const path = context?.path ? `[${context.path}]` : '';
    const method = context?.method ? `[${context.method}]` : '';
    const statusCode = context?.statusCode ? `[${context.statusCode}]` : '';
    
    // Remove sensitive fields before logging
    const sanitizedContext = context ? this.sanitizeContext(context) : {};
    const contextStr = Object.keys(sanitizedContext).length ? JSON.stringify(sanitizedContext) : '';
    
    return `[${timestamp}] ${level.toUpperCase()} ${requestId}${userId}${method}${path}${statusCode}: ${message} ${contextStr}`;
  }

  private sanitizeContext(context: LogContext): LogContext {
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization'];
    const sanitized = { ...context };
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  info(message: string, context?: LogContext) {
    console.log(this.formatMessage('info', message, {
      ...context,
      environment: process.env.NODE_ENV
    }));
  }

  warn(message: string, context?: LogContext) {
    console.warn(this.formatMessage('warn', message, {
      ...context,
      environment: process.env.NODE_ENV
    }));
  }

  error(message: string, error: Error | unknown, context?: LogContext) {
    const errorContext = {
      ...context,
      environment: process.env.NODE_ENV,
      errorName: error instanceof Error ? error.name : 'Unknown Error',
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    };
    console.error(this.formatMessage('error', message, errorContext));
  }

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatMessage('debug', message, {
        ...context,
        environment: process.env.NODE_ENV
      }));
    }
  }

  // Log request body in development
  logRequestBody(body: any, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      const sanitizedBody = this.sanitizeContext(body);
      this.debug('Request body', {
        ...context,
        body: sanitizedBody
      });
    }
  }

  // Log file system operations
  logFileAccess(operation: string, path: string, context?: LogContext) {
    this.info(`File system ${operation}`, {
      ...context,
      filePath: path,
      operation
    });
  }
}

export const logger = new Logger();
