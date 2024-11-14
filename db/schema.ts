import { pgTable, text, integer, timestamp, boolean, jsonb, serial, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  email: text("email").unique().notNull(),
  plan: text("plan").default("free").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  websiteUrl: text("website_url"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const websiteChanges = pgTable("website_changes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  competitorId: integer("competitor_id").notNull().references(() => competitors.id, { onDelete: "cascade" }),
  snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  changes: jsonb("changes"),
  changeType: text("change_type"),
  isReported: boolean("is_reported").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const subscriptions = pgTable("subscriptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  status: text("status").notNull(),
  planType: text("plan_type").notNull(),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const competitors = pgTable("competitors", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  website: text("website").notNull(),
  reason: text("reason"),
  customFields: jsonb("custom_fields").default({}).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const reports = pgTable("reports", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  competitorIds: integer("competitor_ids").array(),
  modules: text("modules").array(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  reportUrl: text("report_url").notNull()
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

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = z.infer<typeof selectUserSchema>;

export const insertSubscriptionSchema = createInsertSchema(subscriptions);
export const selectSubscriptionSchema = createSelectSchema(subscriptions);
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = z.infer<typeof selectSubscriptionSchema>;

export const insertCompetitorSchema = createInsertSchema(competitors);
export const selectCompetitorSchema = createSelectSchema(competitors);
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = z.infer<typeof selectCompetitorSchema>;

export const insertReportSchema = createInsertSchema(reports);
export const selectReportSchema = createSelectSchema(reports);
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = z.infer<typeof selectReportSchema>;

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

export const websiteChangesSchema = createInsertSchema(websiteChanges);
export const selectWebsiteChangesSchema = createSelectSchema(websiteChanges);
export type InsertWebsiteChange = z.infer<typeof websiteChangesSchema>;
export type WebsiteChange = z.infer<typeof selectWebsiteChangesSchema>;

export const researchModulesRelations = relations(researchModules, ({ many }) => ({
  userModules: many(userModules)
}));

export const userModulesRelations = relations(userModules, ({ one }) => ({
  user: one(users, {
    fields: [userModules.userId],
    references: [users.id]
  }),
  module: one(researchModules, {
    fields: [userModules.moduleId],
    references: [researchModules.id]
  })
}));

export type ResearchModule = typeof researchModules.$inferSelect;
export type InsertResearchModule = typeof researchModules.$inferInsert;
