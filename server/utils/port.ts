import net from 'net';
import { logger } from './logger';
import fetch from 'node-fetch';
import type { Response } from 'node-fetch';

export async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number> {
  const isPortAvailable = async (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      // Add timeout to ensure we don't hang
      const timeout = setTimeout(() => {
        try {
          server.close();
          resolve(false);
        } catch (err) {
          resolve(false);
        }
      }, 1000);

      server
        .once('error', () => {
          clearTimeout(timeout);
          server.close();
          resolve(false);
        })
        .once('listening', () => {
          clearTimeout(timeout);
          server.close(() => resolve(true));
        });

      try {
        server.listen(port, '0.0.0.0');
      } catch (err) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  };

  for (let port = startPort; port < startPort + maxAttempts; port++) {
    try {
      logger.info('Checking port availability', { port });
      const available = await isPortAvailable(port);
      
      if (available) {
        logger.info('Port available', {
          port,
          status: 'available'
        });
        return port;
      }
      
      logger.warn('Port in use', {
        port,
        status: 'in_use'
      });
    } catch (error) {
      logger.error('Port check error', {
        error: error instanceof Error ? error.message : String(error),
        port
      });
    }
    // Add a small delay between attempts
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`No available ports found after ${maxAttempts} attempts starting from ${startPort}`);
}

export async function waitForService(
  port: number, 
  endpoint: string = '/health-check', 
  retries: number = 30, 
  interval: number = 1000
): Promise<boolean> {
  const url = `http://localhost:${port}${endpoint}`;
  
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      
      const response: Response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
          logger.info('Service ready', {
            port,
            status: 'ready',
            attempt: i + 1
          });
          return true;
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        logger.warn('Service not ready', {
          port,
          attempt: i + 1,
          maxAttempts: retries,
          error: error.message
        });
      }
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  logger.error('Service failed to start', {
    error: `Service on port ${port} failed to become ready after ${retries} attempts`,
    port,
    retries
  });
  return false;
}

export async function checkPortHealth(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    
    const response = await fetch(`http://localhost:${port}/health-check`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    return false;
  } catch {
    return false;
  }
}
