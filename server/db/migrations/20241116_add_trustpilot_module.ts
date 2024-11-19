import { sql } from 'drizzle-orm';
import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export async function up(db: any) {
  await db.insert(researchModules).values({
    id: 'trustpilot-analysis',
    name: 'Trust Pilot Review Analysis',
    description: 'Analyze competitor reviews and ratings from Trustpilot, including sentiment analysis and trend tracking',
    availableOnFree: false,
    isActive: true,
  });
}

export async function down(db: any) {
  await db
    .delete(researchModules)
    .where(sql`id = 'trustpilot-analysis'`);
} 