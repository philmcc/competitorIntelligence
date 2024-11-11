import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import cors from "cors";
import { db } from "db";
import { sql } from "drizzle-orm";
import { APIError } from "./errors";

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
      console.log('Database connection established successfully');
      return true;
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error);
      if (i < MAX_RETRIES - 1) {
        console.log(`Retrying in ${RETRY_DELAY/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  return false;
}

// Database connection middleware
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await db.execute(sql`SELECT 1`);
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    next(new APIError(500, 'Database connection failed'));
  }
});

// Add routes before Vite middleware
registerRoutes(app);

const server = createServer(app);
const PORT = parseInt(process.env.PORT || '5000', 10);

// Enhanced error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);

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
  if (err.code && err.code.startsWith('23')) { // PostgreSQL error codes
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
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
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
      console.error('Failed to connect to database after retries. Exiting...');
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
      console.log(`[${time}] Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();
