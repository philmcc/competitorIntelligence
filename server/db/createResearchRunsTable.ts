import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient);

async function createResearchRunsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS research_runs (
        id SERIAL PRIMARY KEY,
        competitor_id INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        result JSONB,
        run_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        changes_made BOOLEAN,
        change_details TEXT,
        FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE
      );
    `);
    
    console.log('Research runs table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create table:', error);
    process.exit(1);
  }
}

createResearchRunsTable(); 