import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import type { ListenOptions } from "net";
import cors from "cors";
import { APIError } from "./errors";
import { logger } from "./utils/logger";
import { setupAuth } from "./auth";
import { findAvailablePort, waitForService } from "./utils/port";

const app = express();
const defaultPort = parseInt(process.env.PORT || '3000');
const host = process.env.HOST || '0.0.0.0';
let currentPort: number | null = null;
let server: ReturnType<typeof createServer>;

// Enhanced CORS configuration
const corsOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://0.0.0.0:5173'
];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type'],
  maxAge: 86400
}));

// Body parsing middleware
app.use(express.json({
  limit: '10mb',
  strict: true,
  type: ['application/json', 'application/*+json']
}));

app.use(express.urlencoded({ extended: false }));

// Health check endpoint (before other middleware to ensure it's always accessible)
app.get('/health-check', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    port: currentPort,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Server info endpoint
app.get('/api/server-info', (_req: Request, res: Response) => {
  res.json({ 
    port: currentPort,
    status: 'running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    environment: process.env.NODE_ENV,
    port: currentPort
  });
  next();
});

// JSON content type for API responses
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Setup routes
setupAuth(app);
registerRoutes(app);

// Create HTTP server
server = createServer(app);

// Setup Vite or static file serving
if (process.env.NODE_ENV !== 'production') {
  setupVite(app, server).catch(error => {
    logger.error('Vite setup failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  });
} else {
  serveStatic(app);
}

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      errors: err.errors
    });
  }

  return res.status(500).json({
    status: "error",
    message: "Internal server error",
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack 
    })
  });
});

// Graceful shutdown handler
function setupGracefulShutdown() {
  const shutdown = async () => {
    logger.info('Shutting down server', { port: currentPort });
    
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Start server with port conflict resolution and retry mechanism
async function startServer(retries: number = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      currentPort = await findAvailablePort(defaultPort);
      
      return new Promise((resolve, reject) => {
        const options: ListenOptions = {
          port: currentPort!,
          host,
          ipv6Only: false
        };

        server.listen(options, () => {
          logger.info('Server started', {
            environment: process.env.NODE_ENV,
            port: currentPort,
            host,
            attempt
          });
          resolve();
        });

        server.on('error', (error: Error) => {
          logger.error('Server error', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            attempt
          });
          
          if (attempt === retries) {
            reject(error);
          } else {
            logger.info('Retrying server start', { attempt: attempt + 1, maxAttempts: retries });
          }
        });
      });
    } catch (error) {
      if (attempt === retries) {
        logger.error('Server start failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          attempt
        });
        throw error;
      }
      logger.warn('Retrying server start', { attempt: attempt + 1, maxAttempts: retries });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Failed to start server after all retries');
}

// Initialize server with improved error handling
(async () => {
  try {
    setupGracefulShutdown();
    await startServer();
    
    // Wait for the service to be ready with increased timeout
    const isReady = await waitForService(currentPort!, '/health-check', 30, 1000);
    if (!isReady) {
      throw new Error('Server failed to start properly');
    }
    
    logger.info('Server ready', {
      port: currentPort,
      status: 'ready',
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    logger.error('Critical startup error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
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
