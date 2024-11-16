import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import cors from "cors";
import { APIError } from "./errors";
import { setupAuth } from "./auth";
import { getDb, testConnection } from "../db";
import { sql } from "drizzle-orm";
import * as dotenv from 'dotenv';
import { Server } from 'http';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Basic middleware setup
app.use(express.json({
  limit: '10mb',
  verify: (req: Request, _res: Response, buf: Buffer) => {
    (req as any).rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`, {
    query: req.query,
    timestamp: new Date().toISOString()
  });
  next();
});

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? true : process.env.CORS_ORIGIN || true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const dbStatus = await testConnection();
    if (!dbStatus.connected) {
      throw new Error(dbStatus.error || 'Database connection failed');
    }
    res.json({ 
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize application
const initializeApp = async () => {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  try {
    // Initialize database first
    console.log('Initializing database connection...');
    await getDb();
    console.log('Database connection established');

    // Setup authentication
    console.log('Setting up authentication...');
    setupAuth(app);

    // Register routes
    console.log('Registering routes...');
    registerRoutes(app);

    // Error handling middleware (must be after routes)
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Server error:', err);
      
      if (err instanceof APIError) {
        return res.status(err.statusCode).json({
          status: 'error',
          message: err.message,
          errors: err.errors,
          timestamp: new Date().toISOString()
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });

    // Start server with promise
    return new Promise<Server>((resolve, reject) => {
      try {
        const server = app.listen(port, '0.0.0.0', () => {
          console.log(`Server started on port ${port}`, {
            env: process.env.NODE_ENV,
            timestamp: new Date().toISOString()
          });
          
          // Setup Vite in development after server is running
          if (process.env.NODE_ENV === 'development') {
            setupVite(app, server)
              .then(() => {
                console.log('Vite middleware setup complete');
              })
              .catch((error) => {
                console.error('Vite setup error:', error);
                // Don't reject here, as Vite is optional in dev
              });
          } else {
            serveStatic(app);
          }
          resolve(server);
        });

        // Handle server-specific errors
        server.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use`);
            reject(new Error(`Port ${port} is already in use`));
          } else {
            console.error('Server error:', error);
            reject(error);
          }
        });
      } catch (error) {
        console.error('Server creation error:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error('Application initialization failed:', error);
    throw error;
  }
};

// Start the application with proper error handling
const startServer = async () => {
  try {
    await initializeApp();
  } catch (error) {
    console.error('Critical error:', error);
    process.exit(1);
  }
};

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer();

// Export for testing
export { app, initializeApp };
