import { neon } from '@neondatabase/serverless';
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from 'drizzle-orm';
import * as schema from "./schema";

// Create the database connection with enhanced error handling
const createDbConnection = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  try {
    const neonClient = neon(process.env.DATABASE_URL);
    const db = drizzle(neonClient, { schema });
    return db;
  } catch (error) {
    console.error('Failed to create database connection:', error);
    throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Initialize database connection with retries
const initializeDb = async (retries = 3, delay = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const db = createDbConnection();
      // Verify connection with a test query
      await db.execute(sql`SELECT 1`);
      console.log('Database connection initialized successfully');
      return db;
    } catch (error) {
      console.error(`Database initialization attempt ${attempt}/${retries} failed:`, error);
      if (attempt === retries) {
        throw new Error(`Failed to initialize database after ${retries} attempts`);
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Database initialization failed');
};

let db: ReturnType<typeof createDbConnection>;

// Export a function to get the database instance
export const getDb = async () => {
  if (!db) {
    db = await initializeDb();
  }
  return db;
};

// Export the db instance for backward compatibility
export { db };

// Export a function to test the connection
export const testConnection = async () => {
  try {
    const database = await getDb();
    const result = await database.execute(sql`SELECT NOW()`);
    console.log('Database connection test successful');
    return { connected: true, timestamp: result.rows[0].now };
  } catch (error) {
    console.error('Database connection test failed:', error);
    return { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};
