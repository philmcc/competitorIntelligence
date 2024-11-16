import { pgTable, serial, integer, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { z } from 'zod';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  // ... other user fields
});

export const competitors = pgTable('competitors', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  website: text('website').notNull(),
  isSelected: boolean('is_selected').default(false).notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const websiteResearchResults = pgTable('website_research_results', {
  id: serial('id').primaryKey(),
  competitorId: integer('competitor_id')
    .notNull()
    .references(() => competitors.id),
  currentText: text('current_text').notNull(),
  changesMade: boolean('changes_made').notNull(),
  changeDetails: text('change_details'),
  runDate: timestamp('run_date').defaultNow().notNull(),
});

// Relations
export const competitorsRelations = relations(competitors, ({ many, one }) => ({
  researchResults: many(websiteResearchResults),
  user: one(users, {
    fields: [competitors.userId],
    references: [users.id],
  }),
}));

export const websiteResearchResultsRelations = relations(websiteResearchResults, ({ one }) => ({
  competitor: one(competitors, {
    fields: [websiteResearchResults.competitorId],
    references: [competitors.id],
  }),
}));
