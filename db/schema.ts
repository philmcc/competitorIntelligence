import { pgTable, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  email: text("email").unique().notNull(),
  plan: text("plan").default("free").notNull(),
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

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = z.infer<typeof selectUserSchema>;

export const insertCompetitorSchema = createInsertSchema(competitors);
export const selectCompetitorSchema = createSelectSchema(competitors);
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = z.infer<typeof selectCompetitorSchema>;

export const insertReportSchema = createInsertSchema(reports);
export const selectReportSchema = createSelectSchema(reports);
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = z.infer<typeof selectReportSchema>;
