import { sql } from 'drizzle-orm';
import { pgTable, serial, integer, text, timestamp, decimal } from 'drizzle-orm/pg-core';

export async function up(db: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS trustpilot_reviews (
      id SERIAL PRIMARY KEY,
      competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
      review_id TEXT NOT NULL,
      rating DECIMAL(2,1) NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      published_at TIMESTAMP NOT NULL,
      review_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(competitor_id, review_id)
    )
  `.execute(db);
}

export async function down(db: any) {
  await sql`DROP TABLE IF EXISTS trustpilot_reviews`.execute(db);
}
