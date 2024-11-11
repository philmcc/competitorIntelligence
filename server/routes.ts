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

// Types for webhook response
type WebhookCompetitor = {
  url: string;
  reason: string;
};

type WebhookResponse = {
  competitors: WebhookCompetitor[];
};

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
async function discoverCompetitors(websiteUrl: string): Promise<Array<{name: string; website: string; reason: string}>> {
  try {
    const webhookUrl = process.env.MAKE_DISCOVERY_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new APIError(500, "Make.com webhook URL is not configured");
    }

    if (!isValidWebhookUrl(webhookUrl)) {
      throw new APIError(400, "Invalid Make.com webhook URL format");
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Competitor-Intelligence-System/1.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        website_url: websiteUrl,
        format: "json",
        include_metadata: true,
        timeout: 30000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new APIError(response.status, `Webhook request failed: ${response.statusText}`);
    }

    const responseText = await response.text();
    const jsonStr = responseText.replace(/```json|```/g, '').trim();
    let data: WebhookResponse;
    try {
      data = JSON.parse(jsonStr);
    } catch (error) {
      console.error('JSON parsing error:', error);
      console.error('Response text:', responseText);
      throw new APIError(500, 'Failed to parse webhook response');
    }

    return (data.competitors || []).map(comp => ({
      name: comp.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      website: comp.url,
      reason: comp.reason
    }));

  } catch (error) {
    console.error('Competitor discovery error:', error);
    throw error instanceof APIError ? error : new APIError(500, 'Internal server error during competitor discovery');
  }
}

// Helper function to check competitor limits
async function checkCompetitorLimit(userId: number): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const competitorCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(competitors)
    .where(eq(competitors.userId, userId));

  const limit = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS];
  if (competitorCount[0].count >= limit) {
    throw new APIError(
      403,
      `You have reached the maximum number of competitors (${limit}) for your ${user.plan} plan. Please upgrade to add more competitors.`
    );
  }
}

export function registerRoutes(app: Express) {
  setupAuth(app);
  app.use('/api', setJsonContentType);

  // Website URL update endpoint
  app.put("/api/user/website", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const validation = websiteUrlSchema.safeParse(req.body);

    if (!validation.success) {
      throw new APIError(400, "Invalid website URL", validation.error.errors);
    }

    // Update user without transaction
    const [updatedUser] = await db
      .update(users)
      .set({ websiteUrl: validation.data.websiteUrl })
      .where(eq(users.id, req.user!.id))
      .returning();

    // Update the session user data
    if (req.user) {
      req.user.websiteUrl = validation.data.websiteUrl;
    }

    res.json({
      status: "success",
      data: updatedUser
    });
  }));

  // Competitor discovery endpoint
  app.post("/api/competitors/discover", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const validation = websiteUrlSchema.safeParse(req.body);

    if (!validation.success) {
      throw new APIError(400, "Invalid website URL", validation.error.errors);
    }

    const discoveredCompetitors = await discoverCompetitors(validation.data.websiteUrl);
    res.json({
      status: "success",
      data: discoveredCompetitors
    });
  }));

  // Other existing routes...
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

    await checkCompetitorLimit(req.user!.id);

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

    if (validation.data.isSelected && !existingCompetitor.isSelected) {
      const selectedCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(competitors)
        .where(
          and(
            eq(competitors.userId, req.user!.id),
            eq(competitors.isSelected, true)
          )
        );

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user!.id));

      const limit = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS];
      if (selectedCount[0].count >= limit) {
        throw new APIError(
          403,
          `You have reached the maximum number of selected competitors (${limit}) for your ${user.plan} plan. Please upgrade to select more competitors.`
        );
      }
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
}
