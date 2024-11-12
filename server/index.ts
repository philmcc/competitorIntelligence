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

// Body parsing middleware
app.use(express.json());
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

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request processed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('user-agent'),
      userId: req.user?.id
    });
  });
  
  next();
});

// Database connection middleware
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.execute(sql`SELECT 1`);
    next();
  } catch (error) {
    logger.error('Database connection failed in middleware', error, {
      path: req.path,
      method: req.method,
      userId: req.user?.id
    });
    next(new APIError(500, 'Database connection failed'));
  }
});

// Add routes before Vite middleware
registerRoutes(app);

const server = createServer(app);
const PORT = parseInt(process.env.PORT || '5000', 10);

// Enhanced error handling middleware
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const errorContext = {
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    statusCode: err.statusCode || 500,
    errorType: err.constructor.name
  };

  logger.error('Server error', err, errorContext);

  // Handle different types of errors
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      errors: err.errors
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    return res.status(400).json({
      status: "error",
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
      status: "error",
      message: "Database constraint violation",
      error: process.env.NODE_ENV === 'development' ? err.detail : undefined
    });
  }

  // Default error response
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    status: "error",
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      detail: err.detail 
    })
  });
});

// Graceful shutdown handler
function gracefulShutdown(signal: string) {
  logger.info(`Starting graceful shutdown`, { signal });
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down', null, {
      signal,
      timeoutMs: 10000
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
        totalDelayMs: MAX_RETRIES * RETRY_DELAY
      });
      process.exit(1);
    }

    if (process.env.NODE_ENV !== 'production') {
      await setupVite(app, server);
    } else {
      serveStatic(app);
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
        startTime: time
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
})();
