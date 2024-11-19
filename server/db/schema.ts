import { pgTable, serial, text, boolean, timestamp, integer, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  plan: text("plan").default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  websiteUrl: text("website_url"),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const competitors = pgTable("competitors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  website: text("website").notNull(),
  isSelected: boolean("is_selected").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  trustpilotUrl: text("trustpilot_url"),
});

export const researchRuns = pgTable("research_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  moduleId: text("module_id").notNull(),
  result: jsonb("result"),
  runDate: timestamp("run_date").defaultNow().notNull(),
  changesMade: boolean("changes_made"),
  changeDetails: text("change_details"),
});

export const reports = pgTable("reports", { 
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id").notNull(),
  type: text("type").notNull(),
  content: jsonb("content"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const researchModules = pgTable("research_modules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  availableOnFree: boolean("available_on_free").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const userModules = pgTable("user_modules", {
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  moduleId: integer("module_id")
    .notNull()
    .references(() => researchModules.id, { onDelete: "cascade" }),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.moduleId] })
}));

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  status: text("status").notNull(),
  plan: text("plan").notNull(),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const websiteChanges = pgTable("website_changes", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  previousText: text("previous_text"),
  currentText: text("current_text").notNull(),
  changeDetails: text("change_details"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  isReviewed: boolean("is_reviewed").default(false).notNull(),
  severity: text("severity").default("low"),
});

export const websiteResearchResults = pgTable("website_research_results", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  currentText: text("current_text").notNull(),
  changesMade: boolean("changes_made").default(false).notNull(),
  changeDetails: text("change_details"),
  runDate: timestamp("run_date").defaultNow().notNull()
});

// Define relations
export const competitorsRelations = relations(competitors, ({ many, one }) => ({
  researchRuns: many(researchRuns),
  reports: many(reports),
  websiteChanges: many(websiteChanges),
  websiteResearchResults: many(websiteResearchResults),
  user: one(users, {
    fields: [competitors.userId],
    references: [users.id],
  }),
}));

export const researchRunsRelations = relations(researchRuns, ({ one }) => ({
  competitor: one(competitors, {
    fields: [researchRuns.competitorId],
    references: [competitors.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  competitor: one(competitors, {
    fields: [reports.competitorId],
    references: [competitors.id],
  }),
}));

export const researchModulesRelations = relations(researchModules, ({ many }) => ({
  userModules: many(userModules)
}));

export const userModulesRelations = relations(userModules, ({ one }) => ({
  module: one(researchModules, {
    fields: [userModules.moduleId],
    references: [researchModules.id],
  }),
  user: one(users, {
    fields: [userModules.userId],
    references: [users.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const websiteChangesRelations = relations(websiteChanges, ({ one }) => ({
  competitor: one(competitors, {
    fields: [websiteChanges.competitorId],
    references: [competitors.id],
  }),
}));

export const websiteResearchResultsRelations = relations(websiteResearchResults, ({ one }) => ({
  competitor: one(competitors, {
    fields: [websiteResearchResults.competitorId],
    references: [competitors.id],
  }),
}));

// Update users relations to include subscriptions
export const usersRelations = relations(users, ({ many }) => ({
  competitors: many(competitors),
  subscriptions: many(subscriptions),
  userModules: many(userModules),
}));

// Export types
export type User = typeof users.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type ResearchRun = typeof researchRuns.$inferSelect;
