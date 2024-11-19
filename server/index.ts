import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import cors from "cors";
import { APIError } from "./errors";
import { logger } from "./utils/logger";
import { setupAuth } from "./auth";

const app = express();
const server = createServer(app);

// Graceful shutdown handler
const gracefulShutdown = () => {
  server.close(() => {
    logger.info('Server closed gracefully');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Get allowed origins from environment or use defaults
const corsOriginsEnv = process.env.CORS_ALLOWED_ORIGINS?.split(',') || [];
const defaultOrigins = [
  'http://0.0.0.0:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://0.0.0.0:3001',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  /\.replit\.dev$/,
  /\.preview\.app$/,
  process.env.VITE_API_URL,
  new RegExp(`${process.env.REPL_SLUG}\\..*\\.repl\\.co$`),
  /.*\.repl\.co$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^http:\/\/0\.0\.0\.0:\d+$/
];

const allowedOrigins = [...new Set([...corsOriginsEnv, ...defaultOrigins.filter(Boolean)])];

// CORS configuration with detailed logging
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      logger.info('Request with no origin allowed', { type: 'cors' });
      return callback(null, true);
    }

    // In development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      logger.info('Development mode: allowing all origins', { type: 'cors' });
      return callback(null, true);
    }

    logger.info(`Checking origin: ${origin}`, { type: 'cors' });

    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      }
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      logger.info(`Origin ${origin} allowed by CORS`, { type: 'cors' });
      return callback(null, true);
    }

    logger.warn(`Blocked request from unauthorized origin: ${origin}`, { type: 'cors' });
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400
}));

// Handle preflight requests
app.options('*', cors());

// Body parsing middleware with increased limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup auth and routes before static files
setupAuth(app);
registerRoutes(app);

// Error handling middleware
app.use((err: Error | APIError, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Error occurred:', { 
    type: 'error',
    error: err instanceof Error ? err.message : String(err),
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      errors: err.errors
    });
  }

  res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});

// Server startup function with proper error handling
async function startServer() {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
  const host = process.env.HOST || '0.0.0.0';

  try {
    // In development, setup Vite
    if (process.env.NODE_ENV !== 'production') {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    server.listen(port, host, () => {
      logger.info(`Server started on port ${port}`, { 
        type: 'startup',
        environment: process.env.NODE_ENV,
        url: `http://${host}:${port}`,
        corsConfig: {
          allowedOrigins: allowedOrigins.map(origin => 
            origin instanceof RegExp ? origin.toString() : origin
          )
        }
      });
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error('Port already in use', { type: 'startup_error', port });
        process.exit(1);
      }
      logger.error('Server error:', { 
        type: 'startup_error',
        error: error.message,
        code: error.code
      });
      throw error;
    });

  } catch (error) {
    logger.error('Failed to start server:', { 
      type: 'startup_error',
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }
}

// Start the server
startServer();
