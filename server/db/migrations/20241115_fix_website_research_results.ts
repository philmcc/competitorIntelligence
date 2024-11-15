import { sql } from 'drizzle-orm';

export async function up(db: any) {
  await sql`
    -- Drop any existing relations and table if they exist
    DROP TABLE IF EXISTS website_research_results CASCADE;
    
    -- Create table with proper constraints and schema
    CREATE TABLE IF NOT EXISTS website_research_results (
      id SERIAL PRIMARY KEY,
      competitor_id INTEGER NOT NULL,
      current_text TEXT NOT NULL,
      changes_made BOOLEAN NOT NULL DEFAULT FALSE,
      change_details TEXT,
      run_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT website_research_results_competitor_fk 
        FOREIGN KEY (competitor_id) 
        REFERENCES competitors(id) 
        ON DELETE CASCADE
    );
    
    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_website_research_competitor 
      ON website_research_results(competitor_id);
    CREATE INDEX IF NOT EXISTS idx_website_research_date 
      ON website_research_results(run_date DESC);
  `;
}

export async function down(db: any) {
  await sql`
    DROP TABLE IF EXISTS website_research_results CASCADE;
  `;
}
