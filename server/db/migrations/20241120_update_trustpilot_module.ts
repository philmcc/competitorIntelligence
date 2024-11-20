import { sql } from 'drizzle-orm';
import { competitors, trustpilotReviews } from '../schema';
import { db } from '../../db';

export async function up() {
  // Add custom_fields JSONB column to competitors if it doesn't exist
  await sql`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'competitors' 
        AND column_name = 'custom_fields'
      ) THEN 
        ALTER TABLE competitors 
        ADD COLUMN custom_fields JSONB DEFAULT '{}'::jsonb NOT NULL;
      END IF;
    END $$;
  `.execute(db);

  // Create trustpilot_reviews table if it doesn't exist
  await sql`
    CREATE TABLE IF NOT EXISTS trustpilot_reviews (
      id SERIAL PRIMARY KEY,
      competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
      review_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      published_at TIMESTAMP NOT NULL,
      review_url TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      UNIQUE(competitor_id, review_id)
    );
  `.execute(db);
}

export async function down() {
  await sql`DROP TABLE IF EXISTS trustpilot_reviews;`.execute(db);
  // We won't remove the custom_fields column as it might be used by other features
}
