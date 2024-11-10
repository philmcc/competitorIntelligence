import { Express } from "express";
import { setupAuth } from "./auth";
import { db } from "db";
import { competitors, reports, subscriptions } from "db/schema";
import { eq } from "drizzle-orm";
import { createCustomer, createSubscription, cancelSubscription, handleWebhook } from "./stripe";
import Stripe from "stripe";
import fetch from "node-fetch";

// Helper function to discover competitors based on website URL
async function discoverCompetitors(websiteUrl: string) {
  try {
    // Make.com webhook for competitor discovery
    const webhookUrl = process.env.MAKE_DISCOVERY_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error("Make.com webhook URL not configured");
    }

    // Send request to Make.com webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ websiteUrl }),
    });

    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.statusText}`);
    }

    const competitors = await response.json();
    return competitors.map((comp: any) => ({
      name: comp.name,
      website: comp.website,
      reason: comp.reason || `Discovered through analysis of ${websiteUrl}`,
    }));
  } catch (error) {
    console.error('Make.com webhook error:', error);
    throw error;
  }
}

export function registerRoutes(app: Express) {
  setupAuth(app);

  // Subscription routes
  app.post("/api/subscriptions", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      const subscription = await createSubscription(req.user.id, req.body.priceId);
      res.json(subscription);
    } catch (error) {
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  app.delete("/api/subscriptions", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      await cancelSubscription(req.user.id);
      res.json({ message: "Subscription cancelled" });
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  app.get("/api/subscriptions/status", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, req.user.id));
      res.json(subscription || { status: "none" });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch subscription status" });
    }
  });

  // Stripe webhook handler
  app.post("/api/webhooks/stripe", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2024-10-28.acacia"
      });
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig as string,
        endpointSecret!
      );
      await handleWebhook(event);
      res.json({ received: true });
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  });

  // Updated competitor discovery endpoint
  app.post("/api/competitors/discover", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      const { websiteUrl } = req.body;
      
      if (!websiteUrl) {
        return res.status(400).json({ 
          message: "Website URL is required" 
        });
      }

      // Validate URL format
      try {
        new URL(websiteUrl);
      } catch (e) {
        return res.status(400).json({ 
          message: "Invalid website URL format" 
        });
      }

      // Get existing competitors to avoid duplicates
      const existingCompetitors = await db
        .select()
        .from(competitors)
        .where(eq(competitors.userId, req.user.id));

      const discoveredCompetitors = await discoverCompetitors(websiteUrl);
      
      // Filter out any competitors that the user already has
      const filteredCompetitors = discoveredCompetitors.filter(
        discovered => !existingCompetitors.some(
          existing => existing.website === discovered.website
        )
      );

      res.json(filteredCompetitors);
    } catch (error) {
      console.error('Competitor discovery error:', error);
      res.status(500).json({ 
        message: "Failed to discover competitors",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

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
      const [report] = await db
        .insert(reports)
        .values({
          userId: req.user.id,
          competitorIds: req.body.competitorIds || [],
          modules: req.body.modules || ["website-changes", "trustpilot"],
          reportUrl: "https://example.com/report.pdf", // Replace with actual report URL from Make.com
        })
        .returning();
      res.json(report);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate report" });
    }
  });
}