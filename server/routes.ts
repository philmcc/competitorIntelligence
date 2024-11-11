import { Express } from "express";
import { setupAuth } from "./auth";
import { db } from "db";
import { competitors, reports, subscriptions } from "db/schema";
import { eq } from "drizzle-orm";
import { createCustomer, createSubscription, cancelSubscription, handleWebhook } from "./stripe";
import Stripe from "stripe";
import fetch from "node-fetch";

// Helper function to validate webhook URL
function isValidWebhookUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' && parsedUrl.hostname.includes('make.com');
  } catch {
    return false;
  }
}

// Helper function to discover competitors based on website URL
async function discoverCompetitors(websiteUrl: string) {
  try {
    const webhookUrl = process.env.MAKE_DISCOVERY_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error("Make.com webhook URL is not configured");
    }

    // Validate webhook URL
    if (!isValidWebhookUrl(webhookUrl)) {
      throw new Error("Invalid Make.com webhook URL format");
    }

    // Enhanced request with better error handling and timeout
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Competitor-Intelligence-System/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        url: websiteUrl, // Changed from website_url to url
        format: "json",
        include_metadata: true,
        timeout: 30000 // 30 seconds timeout
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Webhook request failed: ${response.statusText}`);
    }

    // Get response as text first
    const responseText = await response.text();
    // Remove markdown formatting if present
    const jsonStr = responseText.replace(/```json\n|\n```/g, '').trim();
    
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (error) {
      console.error('JSON parsing error:', error);
      console.error('Response text:', responseText);
      throw new Error('Failed to parse webhook response');
    }
    
    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format from webhook');
    }

    // Handle both array and single object responses
    const competitors = Array.isArray(data) ? data : [data];
    
    return competitors.map(comp => ({
      name: comp.company_name || comp.name || 'Unknown Company',
      website: comp.website_url || comp.website || comp.url || '',
      reason: comp.discovery_reason || comp.reason || 'Competitor in your industry'
    }));

  } catch (error) {
    console.error('Competitor discovery error:', error);
    throw error;
  }
}

// Rest of the file remains unchanged
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
        apiVersion: "2023-10-16"
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
      
      // Filter out duplicates
      const newCompetitors = discoveredCompetitors.filter(
        discovered => !existingCompetitors.some(
          existing => existing.website === discovered.website
        )
      );

      res.json(newCompetitors);
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
