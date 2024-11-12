import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import cors from "cors";
import { db } from "db";
import { sql } from "drizzle-orm";
import { APIError } from "./errors";
import { logger } from "./utils/logger";

const app = express();

// Enable CORS with proper configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.CLIENT_URL || false 
    : 'http://localhost:5000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware with validation logging
app.use(express.json({
  verify: (req: Request, _res, buf) => {
    try {
      JSON.parse(buf.toString());
      // Log request body in development
      if (process.env.NODE_ENV === 'development') {
        logger.logRequestBody(JSON.parse(buf.toString()), {
          requestId: req.requestId,
          path: req.path,
          method: req.method
        });
      }
    } catch (e) {
      logger.error('Invalid JSON in request body', e, {
        path: req.path,
        method: req.method,
        contentType: req.get('content-type'),
        requestId: req.requestId
      });
      throw new APIError(400, 'Invalid JSON payload');
    }
  }
}));
app.use(express.urlencoded({ extended: false }));

// Database health check middleware with retry logic
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // 2 seconds

async function waitForDatabase() {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await db.execute(sql`SELECT 1`);
      logger.info('Database connection established successfully', {
        attempt: i + 1,
        totalAttempts: MAX_RETRIES
      });
      return true;
    } catch (error) {
      logger.error(`Database connection attempt ${i + 1} failed`, error, {
        attempt: i + 1,
        totalAttempts: MAX_RETRIES,
        retryDelay: RETRY_DELAY
      });
      if (i < MAX_RETRIES - 1) {
        logger.info(`Retrying database connection`, {
          nextAttempt: i + 2,
          delayMs: RETRY_DELAY
        });
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  return false;
}

// Enhanced request logging middleware with performance tracking
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // Attach request ID to the request object for correlation
  req.requestId = requestId;
  
  // Log request start
  logger.info('Request started', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
    contentType: req.get('content-type'),
    ip: req.ip
  });
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length'),
      userAgent: req.get('user-agent'),
      userId: req.user?.id,
      ip: req.ip
    });
  });
  
  next();
});

// Database connection middleware with enhanced error logging
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.execute(sql`SELECT 1`);
    next();
  } catch (error) {
    logger.error('Database connection failed in middleware', error, {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      query: req.query,
      ip: req.ip
    });
    next(new APIError(500, 'Database connection failed'));
  }
});

// Add routes before error handlers
registerRoutes(app);

// Rate limiting middleware with logging
const requestCounts = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per minute

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || 'unknown';
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Clean up old entries
  const entriesToDelete: string[] = [];
  requestCounts.forEach((data, ip) => {
    if (data.timestamp < windowStart) {
      entriesToDelete.push(ip);
    }
  });
  entriesToDelete.forEach(ip => requestCounts.delete(ip));
  
  // Get or create rate limit data for this IP
  const rateData = requestCounts.get(clientIP) ?? { count: 0, timestamp: now };
  
  // Reset count if outside window
  if (rateData.timestamp < windowStart) {
    rateData.count = 0;
    rateData.timestamp = now;
  }
  
  rateData.count++;
  requestCounts.set(clientIP, rateData);
  
  if (rateData.count > RATE_LIMIT_MAX) {
    logger.warn('Rate limit exceeded', {
      requestId: req.requestId,
      clientIP,
      count: rateData.count,
      window: RATE_LIMIT_WINDOW,
      limit: RATE_LIMIT_MAX,
      path: req.path,
      method: req.method,
      userId: req.user?.id
    });
    
    return res.status(429).json({
      status: "error",
      message: "Too many requests",
      retryAfter: Math.ceil((rateData.timestamp + RATE_LIMIT_WINDOW - now) / 1000)
    });
  }
  
  next();
});

const server = createServer(app);
const PORT = parseInt(process.env.PORT || '5000', 10);

// API 404 handler - after routes but before error handler
app.use('/api/*', (req: Request, res: Response) => {
  logger.info('API 404 Not Found', {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    query: req.query,
    ip: req.ip
  });
  
  res.status(404).json({
    status: "error",
    message: "API endpoint not found",
    path: req.path
  });
});

// Enhanced API error handling middleware
app.use('/api', (err: any, req: Request, res: Response, _next: NextFunction) => {
  const errorContext = {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    query: req.query,
    statusCode: err.statusCode || 500,
    errorType: err.constructor.name,
    errorName: err.name,
    timestamp: new Date().toISOString(),
    ip: req.ip,
    environment: process.env.NODE_ENV
  };

  logger.error('API error', err, errorContext);

  // Include correlation ID and timestamp in all error responses
  const baseErrorResponse = {
    status: "error",
    requestId: req.requestId,
    timestamp: new Date().toISOString()
  };

  // Handle different types of errors
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      ...baseErrorResponse,
      message: err.message,
      errors: err.errors
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    return res.status(400).json({
      ...baseErrorResponse,
      message: "Validation failed",
      errors: err.errors || err.issues
    });
  }

  // Handle database errors
  if (err.code && err.code.startsWith('23')) {
    const dbErrorContext = {
      ...errorContext,
      dbErrorCode: err.code,
      dbErrorDetail: process.env.NODE_ENV === 'development' ? err.detail : undefined
    };
    logger.error('Database constraint violation', err, dbErrorContext);
    
    return res.status(400).json({
      ...baseErrorResponse,
      message: "Database constraint violation",
      error: process.env.NODE_ENV === 'development' ? err.detail : undefined
    });
  }

  // Default error response
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    ...baseErrorResponse,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      detail: err.detail 
    })
  });
});

// Non-API routes should be handled by Vite/Static file server
if (process.env.NODE_ENV !== 'production') {
  setupVite(app, server).catch(error => {
    logger.error('Failed to setup Vite middleware', error);
    process.exit(1);
  });
} else {
  serveStatic(app);
}

// Graceful shutdown handler with enhanced logging
function gracefulShutdown(signal: string) {
  logger.info(`Starting graceful shutdown`, { 
    signal,
    activeConnections: server.getConnections((err, count) => count),
    timestamp: new Date().toISOString()
  });
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down', null, {
      signal,
      timeoutMs: 10000,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Setup Vite middleware and start server
(async () => {
  try {
    // Wait for database before starting server
    const dbReady = await waitForDatabase();
    if (!dbReady) {
      logger.error('Failed to connect to database after retries', null, {
        maxRetries: MAX_RETRIES,
        totalDelayMs: MAX_RETRIES * RETRY_DELAY,
        timestamp: new Date().toISOString()
      });
      process.exit(1);
    }

    server.listen(PORT, () => {
      const time = new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      logger.info(`Server started`, {
        port: PORT,
        nodeEnv: process.env.NODE_ENV,
        startTime: time,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error, {
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
})();

// Add types for request ID
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}