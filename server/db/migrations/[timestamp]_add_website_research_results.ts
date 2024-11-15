import { sql } from 'drizzle-orm';

export async function up(db: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS website_research_results (
      id SERIAL PRIMARY KEY,
      competitor_id INTEGER NOT NULL REFERENCES competitors(id),
      current_text TEXT NOT NULL,
      changes_made BOOLEAN NOT NULL,
      change_details TEXT,
      run_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
}

export async function down(db: any) {
  await sql`DROP TABLE IF EXISTS website_research_results;`;
} 