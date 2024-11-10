import { Express } from "express";
import { setupAuth } from "./auth";
import { db } from "db";
import { competitors, reports } from "db/schema";
import { eq } from "drizzle-orm";

export function registerRoutes(app: Express) {
  setupAuth(app);

  // Competitor routes
  app.get("/api/competitors", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      const userCompetitors = await db
        .select()
        .from(competitors)
        .where(eq(competitors.userId, req.user.id));
      res.json(userCompetitors);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch competitors" });
    }
  });

  app.post("/api/competitors", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      const [competitor] = await db
        .insert(competitors)
        .values({
          ...req.body,
          userId: req.user.id,
        })
        .returning();
      res.json(competitor);
    } catch (error) {
      res.status(500).json({ message: "Failed to add competitor" });
    }
  });

  app.put("/api/competitors/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      const [competitor] = await db
        .update(competitors)
        .set(req.body)
        .where(eq(competitors.id, parseInt(req.params.id)))
        .returning();
      res.json(competitor);
    } catch (error) {
      res.status(500).json({ message: "Failed to update competitor" });
    }
  });

  app.delete("/api/competitors/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      await db
        .delete(competitors)
        .where(eq(competitors.id, parseInt(req.params.id)));
      res.json({ message: "Competitor deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete competitor" });
    }
  });

  // Report routes
  app.get("/api/reports", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      const userReports = await db
        .select()
        .from(reports)
        .where(eq(reports.userId, req.user.id));
      res.json(userReports);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.post("/api/reports/generate", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      // TODO: Implement Make.com webhook integration for report generation
      const [report] = await db
        .insert(reports)
        .values({
          userId: req.user.id,
          competitorIds: [1], // Replace with actual competitor IDs
          modules: ["website-changes", "trustpilot"],
          reportUrl: "https://example.com/report.pdf", // Replace with actual report URL
        })
        .returning();
      res.json(report);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate report" });
    }
  });
}
