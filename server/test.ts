import express from "express";

const app = express();

// Basic error handling
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
  next();
});

app.get("/test", (_req, res) => {
  res.json({ status: "success", message: "Server is running" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

const startServer = async () => {
  const port = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT) : 3001;

  try {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`Test server running on port ${port}`);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
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

startServer().catch(error => {
  console.error('Critical server error:', error);
  process.exit(1);
});
