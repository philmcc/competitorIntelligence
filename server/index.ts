import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { createServer } from "http";
import cors from "cors";
import { APIError } from "./errors";
import { logger } from "./utils/logger";
import { setupAuth } from "./auth";

const app = express();

// Enhanced CORS configuration for development and production
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL || 'https://your-production-url.com'
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Type'],
  maxAge: 86400 // 24 hours
}));

// Body parsing middleware with enhanced configuration
app.use(express.json({
  limit: '10mb',
  strict: true,
  type: ['application/json', 'application/*+json']
}));

app.use(express.urlencoded({ extended: false }));

// Enhanced global JSON parsing error handler with detailed logging
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    logger.error('JSON parsing error:', {
      error: err.message,
      path: req.path,
      method: req.method,
      contentType: req.get('content-type'),
      body: req.body,
      headers: req.headers,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    res.setHeader('Content-Type', 'application/json');
    return res.status(400).json({
      status: "error",
      message: "Invalid JSON payload",
      errors: [{
        type: "json_parse_error",
        message: process.env.NODE_ENV === 'development' ? err.message : "Malformed JSON request"
      }]
    });
  }
  next(err);
});

// Set JSON content type for all API responses
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Setup routes
setupAuth(app);
registerRoutes(app);

const server = createServer(app);

// Non-API routes should be handled by Vite/Static file server
if (process.env.NODE_ENV !== 'production') {
  setupVite(app, server).catch(error => {
    logger.error('Failed to setup Vite middleware', error);
    process.exit(1);
  });
} else {
  serveStatic(app);
}

// Enhanced error handling middleware - must be after all routes
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  // Set content type header
  res.setHeader('Content-Type', 'application/json');

  // Handle known error types
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      errors: err.errors
    });
  }

  // Handle unknown errors
  res.status(500).json({
    status: "error",
    message: "Internal server error",
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      timestamp: new Date().toISOString()
    })
  });
});

// Add this after setting up all routes
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Optional: Log all registered routes
app._router.stack.forEach((r: any) => {
  if (r.route && r.route.path) {
    console.log(`Route registered: ${Object.keys(r.route.methods)} ${r.route.path}`);
  }
});

// Start server
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

server.listen(port, '0.0.0.0', () => {
  logger.info(`Server started on port ${port}`);
});

// Add types for request ID
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
