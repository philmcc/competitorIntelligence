import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

async function getBackendPort() {
  const defaultPort = 3000;
  let retries = 0;
  const maxRetries = 15;
  const retryInterval = 2000;
  
  while (retries < maxRetries) {
    try {
      const response = await fetch(`http://localhost:${defaultPort}/api/server-info`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'running') {
          console.log(`Successfully connected to backend on port ${data.port}`);
          return data.port;
        }
      }
    } catch (error) {
      console.warn(`Attempt ${retries + 1}/${maxRetries}: Could not fetch backend port, retrying...`);
    }
    await new Promise(resolve => setTimeout(resolve, retryInterval));
    retries++;
  }
  throw new Error('Could not connect to backend server after all retries');
}

async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number> {
  const isPortAvailable = async (port: number): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      
      try {
        await fetch(`http://localhost:${port}/health-check`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return false; // Port is in use
      } catch (error) {
        clearTimeout(timeoutId);
        return true; // Port is available
      }
    } catch (error) {
      return true; // Port is available (connection failed)
    }
  };

  for (let port = startPort; port < startPort + maxAttempts; port++) {
    console.log(`Checking port ${port} availability...`);
    if (await isPortAvailable(port)) {
      console.log(`Found available frontend port: ${port}`);
      return port;
    }
  }
  
  throw new Error(`No available ports found after ${maxAttempts} attempts starting from ${startPort}`);
}

export default defineConfig(async () => {
  try {
    const backendPort = await getBackendPort();
    const frontendPort = await findAvailablePort(5173);
    
    console.log(`Configuring Vite with backend port: ${backendPort}, frontend port: ${frontendPort}`);
    
    return {
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
      server: {
        proxy: {
          '/api': {
            target: `http://localhost:${backendPort}`,
            changeOrigin: true,
            secure: false,
            ws: true,
            onError: (err: Error) => {
              console.error('Proxy error:', err);
            },
            configure: (proxy: any, _options: any) => {
              proxy.on('error', (err: Error, _req: any, _res: any) => {
                console.warn('Proxy error:', err);
              });
              proxy.on('proxyReq', (_proxyReq: any, req: any, _res: any) => {
                console.log(`Proxying ${req.method} ${req.url} to backend`);
              });
            },
          },
        },
        host: '0.0.0.0',
        port: frontendPort,
        strictPort: true, // Force the specified port
        middlewareMode: false,
        cors: true,
      },
    };
  } catch (error) {
    console.error('Failed to configure Vite:', error);
    process.exit(1);
  }
});
