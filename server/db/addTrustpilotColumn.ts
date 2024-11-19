import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient);

async function addTrustpilotColumn() {
  try {
    await db.execute(sql`
      ALTER TABLE competitors 
      ADD COLUMN IF NOT EXISTS trustpilot_url TEXT;
    `);
    
    console.log('Trustpilot URL column added successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to add column:', error);
    process.exit(1);
  }
}

addTrustpilotColumn(); 