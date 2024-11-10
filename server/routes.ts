import { Express } from "express";
import { setupAuth } from "./auth";
import { db } from "db";
import { competitors, reports, subscriptions } from "db/schema";
import { eq } from "drizzle-orm";
import { createCustomer, createSubscription, cancelSubscription, handleWebhook } from "./stripe";
import Stripe from "stripe";

// Define valid industries for type safety
type ValidIndustry = 'Software' | 'Healthcare' | 'Retail';

// Helper function to discover competitors based on industry and keywords
async function discoverCompetitors(industry: string, keywords: string[]) {
  // This is a mock implementation that generates more relevant suggestions
  // based on the provided industry and keywords
  const suggestions = [];
  
  // Industry-based suggestions
  suggestions.push({
    name: `${industry} Innovations`,
    website: `https://www.${industry.toLowerCase().replace(/\s+/g, '')}innovations.com`,
    reason: `Leading innovator in the ${industry} space`,
  });
  
  suggestions.push({
    name: `${industry} Global Solutions`,
    website: `https://www.${industry.toLowerCase().replace(/\s+/g, '')}global.com`,
    reason: `Global market leader in ${industry}`,
  });

  // Keyword-based suggestions
  keywords.forEach((keyword, index) => {
    if (index < 3) { // Limit to 3 keyword-based suggestions
      const cleanKeyword = keyword.trim().toLowerCase().replace(/\s+/g, '');
      suggestions.push({
        name: `${keyword.trim()} Technologies`,
        website: `https://www.${cleanKeyword}tech.com`,
        reason: `Specializes in ${keyword.trim()} within the ${industry} sector`,
      });
    }
  });

  // Add some industry-specific competitors
  const industrySpecific: Record<ValidIndustry, Array<{ name: string; website: string; reason: string; }>> = {
    'Software': [
      {
        name: 'TechForward Solutions',
        website: 'https://www.techforward.com',
        reason: `Emerging player in ${keywords.join(', ')}`,
      },
    ],
    'Healthcare': [
      {
        name: 'HealthTech Innovations',
        website: 'https://www.healthtechinnovations.com',
        reason: `Healthcare solutions provider focusing on ${keywords.join(', ')}`,
      },
    ],
    'Retail': [
      {
        name: 'RetailNext',
        website: 'https://www.retailnext.com',
        reason: `Retail technology provider specializing in ${keywords.join(', ')}`,
      },
    ],
  };

  if (industry in industrySpecific) {
    suggestions.push(...industrySpecific[industry as ValidIndustry]);
  }

  return suggestions;
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

  // Competitor discovery endpoint
  app.post("/api/competitors/discover", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
      const { industry, keywords } = req.body;
      
      if (!industry || !keywords?.length) {
        return res.status(400).json({ 
          message: "Industry and at least one keyword are required" 
        });
      }

      // Validate input
      if (typeof industry !== 'string' || !Array.isArray(keywords)) {
        return res.status(400).json({ 
          message: "Invalid input format" 
        });
      }

      // Get existing competitors to avoid duplicates
      const existingCompetitors = await db
        .select()
        .from(competitors)
        .where(eq(competitors.userId, req.user.id));

      const discoveredCompetitors = await discoverCompetitors(industry, keywords);
      
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
