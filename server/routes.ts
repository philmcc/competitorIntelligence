import { Express, Request, Response, NextFunction } from "express";
import { setupAuth } from "./auth";
import { db } from "db";
import { competitors, reports, subscriptions, users } from "db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createCustomer, createSubscription, cancelSubscription, handleWebhook } from "./stripe";
import Stripe from "stripe";
import fetch from "node-fetch";
import { z } from "zod";
import { APIError } from "./errors";

// Validation schemas
const competitorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  website: z.string().url("Invalid website URL"),
  reason: z.string().optional(),
  customFields: z.record(z.any()).optional(),
  isSelected: z.boolean().optional()
});

const websiteUrlSchema = z.object({
  websiteUrl: z.string().url("Invalid website URL").refine(
    url => url.startsWith('http://') || url.startsWith('https://'),
    "URL must start with http:// or https://"
  )
});

// Plan limits
const PLAN_LIMITS = {
  free: 3,
  pro: 15
};

// Helper function to discover competitors based on website URL
async function discoverCompetitors(websiteUrl: string): Promise<Array<{name: string; website: string; reason: string}>> {
  try {
    const webhookUrl = process.env.MAKE_DISCOVERY_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new APIError(500, "Make.com webhook URL is not configured");
    }

    console.log('Sending webhook request to:', webhookUrl);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ website_url: websiteUrl })
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));

    // Check content type before reading the response
    const contentType = response.headers.get('content-type');
    console.log('Content-Type:', contentType);

    const rawResponse = await response.text();
    console.log('Raw response:', rawResponse);

    let responseData;
    try {
      // Only try to parse if we have content
      if (!rawResponse.trim()) {
        throw new Error("Empty response from webhook");
      }
      responseData = JSON.parse(rawResponse);
      console.log('Parsed response:', JSON.stringify(responseData, null, 2));
    } catch (error) {
      console.error('JSON parse error:', error);
      throw new APIError(400, `Invalid JSON response from webhook: ${error.message}`);
    }

    // Validate the response structure
    if (!responseData || typeof responseData !== 'object') {
      throw new APIError(400, "Invalid response format: expected JSON object");
    }

    if (!Array.isArray(responseData.competitors)) {
      // Check if the response itself is an array
      if (Array.isArray(responseData)) {
        responseData = { competitors: responseData };
      } else {
        throw new APIError(400, "Invalid response format: missing competitors array");
      }
    }

    return responseData.competitors
      .filter(comp => comp && typeof comp === 'object' && comp.url)
      .map(comp => ({
        name: new URL(comp.url).hostname.replace(/^www\./, ''),
        website: comp.url,
        reason: comp.reason || ''
      }));

  } catch (error) {
    console.error('Competitor discovery error:', error);
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(500, `Failed to discover competitors: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Error handler wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };

// Middleware
const setJsonContentType = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Type', 'application/json');
  next();
};

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new APIError(401, "Unauthorized");
  }
  next();
};

// Helper function to check selected competitor limits
async function checkSelectedCompetitorLimit(userId: number): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const selectedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(competitors)
    .where(
      and(
        eq(competitors.userId, userId),
        eq(competitors.isSelected, true)
      )
    );

  const limit = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS];
  if (selectedCount[0].count >= limit) {
    throw new APIError(
      403,
      `You have reached the maximum number of selected competitors (${limit}) for your ${user.plan} plan. You can still add competitors to your available list, but please upgrade to select more competitors for tracking.`
    );
  }
}

export function registerRoutes(app: Express) {
  setupAuth(app);
  app.use('/api', setJsonContentType);

  // Website URL update endpoint with improved error handling
  app.put("/api/user/website", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const validation = websiteUrlSchema.safeParse(req.body);

    if (!validation.success) {
      throw new APIError(400, "Invalid website URL", validation.error.errors);
    }

    try {
      // Start a transaction to ensure data consistency
      const [updatedUser] = await db
        .update(users)
        .set({ websiteUrl: validation.data.websiteUrl })
        .where(eq(users.id, req.user!.id))
        .returning();

      // Update session synchronously
      if (req.user) {
        req.user.websiteUrl = validation.data.websiteUrl;
      }

      // Force session save
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          throw new APIError(500, "Failed to persist website URL");
        }
      });

      res.json({
        status: "success",
        data: updatedUser
      });
    } catch (error) {
      console.error('Error updating website URL:', error);
      throw new APIError(500, "Failed to update website URL");
    }
  }));

  // Competitor discovery endpoint with enhanced validation
  app.post("/api/competitors/discover", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const validation = websiteUrlSchema.safeParse(req.body);

    if (!validation.success) {
      throw new APIError(400, "Invalid website URL", validation.error.errors);
    }

    try {
      const discoveredCompetitors = await discoverCompetitors(validation.data.websiteUrl);
      
      // Return in standard format matching our API convention
      res.json({
        status: "success",
        data: discoveredCompetitors
      });
    } catch (error) {
      console.error('Error in competitor discovery endpoint:', error);
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to discover competitors");
    }
  }));

  // Competitors management routes
  app.get("/api/competitors", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userCompetitors = await db
      .select()
      .from(competitors)
      .where(eq(competitors.userId, req.user!.id));
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user!.id));

    const limit = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS];
    const selectedCount = userCompetitors.filter(c => c.isSelected).length;
    
    res.json({
      status: "success",
      data: userCompetitors,
      meta: {
        total: userCompetitors.length,
        limit,
        remaining: Math.max(0, limit - selectedCount)
      }
    });
  }));

  app.post("/api/competitors", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const validation = competitorSchema.safeParse(req.body);

    if (!validation.success) {
      throw new APIError(400, "Validation failed", validation.error.errors);
    }

    // Only check limit if the competitor is being added as selected
    if (validation.data.isSelected) {
      await checkSelectedCompetitorLimit(req.user!.id);
    }

    const [competitor] = await db
      .insert(competitors)
      .values({
        ...validation.data,
        userId: req.user!.id,
      })
      .returning();

    res.json({
      status: "success",
      data: competitor
    });
  }));

  app.put("/api/competitors/:id", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const validation = competitorSchema.partial().safeParse(req.body);

    if (!validation.success) {
      throw new APIError(400, "Validation failed", validation.error.errors);
    }

    const [existingCompetitor] = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, parseInt(req.params.id)));

    if (!existingCompetitor || existingCompetitor.userId !== req.user!.id) {
      throw new APIError(404, "Competitor not found");
    }

    // Check limit only when changing isSelected from false to true
    if (validation.data.isSelected && !existingCompetitor.isSelected) {
      await checkSelectedCompetitorLimit(req.user!.id);
    }

    const [competitor] = await db
      .update(competitors)
      .set(validation.data)
      .where(eq(competitors.id, parseInt(req.params.id)))
      .returning();

    res.json({
      status: "success",
      data: competitor
    });
  }));

  app.delete("/api/competitors/:id", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const [existingCompetitor] = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, parseInt(req.params.id)));

    if (!existingCompetitor || existingCompetitor.userId !== req.user!.id) {
      throw new APIError(404, "Competitor not found");
    }

    await db
      .delete(competitors)
      .where(eq(competitors.id, parseInt(req.params.id)));

    res.json({
      status: "success",
      message: "Competitor deleted successfully"
    });
  }));

  // Subscription routes
  app.post("/api/subscriptions/create", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { priceId } = req.body;

    if (!priceId) {
      throw new APIError(400, "Price ID is required");
    }

    const result = await createSubscription(req.user!.id, priceId);
  
    res.json({
      status: "success",
      data: result
    });
  }));

  app.post("/api/subscriptions/cancel", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const result = await cancelSubscription(req.user!.id);
  
    res.json({
      status: "success",
      data: result
    });
  }));
}