import { Express, Request, Response, NextFunction } from "express";
import { setupAuth } from "./auth";
import { db } from "db";
import { competitors, reports, subscriptions, users, researchModules, userModules } from "db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createCustomer, createSubscription, cancelSubscription } from "./stripe";
import Stripe from "stripe";
import fetch from "node-fetch";
import { z } from "zod";
import { APIError } from "./errors";
import { requireAdmin } from "./middleware/admin";
import { moduleSchema } from "./schemas";

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

const moduleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  availableOnFree: z.boolean().optional()
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

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ website_url: websiteUrl })
    });

    const rawResponse = await response.text();
    
    if (!rawResponse.trim()) {
      throw new Error("Empty response from webhook");
    }
    
    const responseData = JSON.parse(rawResponse);

    if (!responseData || typeof responseData !== 'object') {
      throw new APIError(400, "Invalid response format: expected JSON object");
    }

    if (!Array.isArray(responseData.competitors)) {
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
      `You have reached the maximum number of selected competitors (${limit}) for your ${user.plan} plan. Please upgrade to select more competitors.`
    );
  }
}

export function registerRoutes(app: Express) {
  setupAuth(app);
  app.use('/api', setJsonContentType);

  // Admin Routes
  app.get("/api/admin/users", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        plan: users.plan,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        websiteUrl: users.websiteUrl
      })
      .from(users);
    
    res.json({
      status: "success",
      data: allUsers
    });
  }));

  app.get("/api/admin/users/:userId/competitors", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId);
    
    // Validate that the user exists
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new APIError(404, "User not found");
    }

    // Get all competitors for the user
    const userCompetitors = await db
      .select({
        id: competitors.id,
        name: competitors.name,
        website: competitors.website,
        isActive: competitors.isActive,
        isSelected: competitors.isSelected,
        createdAt: competitors.createdAt
      })
      .from(competitors)
      .where(eq(competitors.userId, userId))
      .orderBy(
        sql`${competitors.isSelected} DESC, ${competitors.createdAt} DESC`
      );

    res.json({
      status: "success",
      data: userCompetitors
    });
  }));

  app.put("/api/admin/users/:userId", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const { plan, isAdmin } = req.body;
    
    const [updatedUser] = await db
      .update(users)
      .set({ 
        plan: plan || undefined,
        isAdmin: isAdmin !== undefined ? isAdmin : undefined
      })
      .where(eq(users.id, parseInt(req.params.userId)))
      .returning();
    
    res.json({
      status: "success",
      data: updatedUser
    });
  }));

  // Subscription routes
  app.get("/api/subscriptions/status", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, req.user!.id));
    res.json({
      status: "success",
      data: subscription
    });
  }));

  app.post("/api/subscriptions/create", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { priceId } = req.body;

    if (!priceId) {
      throw new APIError(400, "Price ID is required");
    }

    const result = await createSubscription(req.user!.id, priceId);

    // Update user's plan to pro after successful subscription
    await db.update(users)
      .set({ plan: 'pro' })
      .where(eq(users.id, req.user!.id));

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

  // Website URL update endpoint
  app.put("/api/user/website", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const validation = websiteUrlSchema.safeParse(req.body);

    if (!validation.success) {
      throw new APIError(400, "Invalid website URL", validation.error.errors);
    }

    try {
      const [updatedUser] = await db
        .update(users)
        .set({ websiteUrl: validation.data.websiteUrl })
        .where(eq(users.id, req.user!.id))
        .returning();

      if (req.user) {
        req.user.websiteUrl = validation.data.websiteUrl;
      }

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

  // Competitor routes
  app.post("/api/competitors/discover", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const validation = websiteUrlSchema.safeParse(req.body);

    if (!validation.success) {
      throw new APIError(400, "Invalid website URL", validation.error.errors);
    }

    try {
      const discoveredCompetitors = await discoverCompetitors(validation.data.websiteUrl);
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

  // Add statistics endpoint for admin dashboard
  app.get("/api/admin/statistics", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    // Get total users count
    const [{ count: totalUsers }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);

    // Get users by plan
    const usersByPlan = await db
      .select({
        plan: users.plan,
        count: sql<number>`count(*)`
      })
      .from(users)
      .groupBy(users.plan);

    // Get competitors statistics
    const [competitorStats] = await db
      .select({
        totalCompetitors: sql<number>`count(*)`,
        activeCompetitors: sql<number>`count(*) filter (where ${competitors.isActive} = true)`,
        selectedCompetitors: sql<number>`count(*) filter (where ${competitors.isSelected} = true)`
      })
      .from(competitors);

    const freeUsers = usersByPlan.find(u => u.plan === 'free')?.count || 0;
    const proUsers = usersByPlan.find(u => u.plan === 'pro')?.count || 0;

    res.json({
      status: "success",
      data: {
        users: {
          totalUsers,
          freeUsers,
          proUsers
        },
        competitors: competitorStats
      }
    });
  }));

  // Admin module management routes
  app.get("/api/admin/modules", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const modules = await db
      .select({
        id: researchModules.id,
        name: researchModules.name,
        description: researchModules.description,
        availableOnFree: researchModules.availableOnFree,
        isActive: researchModules.isActive,
        userCount: sql<number>`count(distinct ${userModules.userId})`
      })
      .from(researchModules)
      .leftJoin(userModules, eq(researchModules.id, userModules.moduleId))
      .groupBy(researchModules.id)
      .orderBy(researchModules.name);

    res.json({
      status: "success",
      data: modules
    });
  }));

  app.post("/api/admin/modules", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const validation = moduleSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new APIError(400, "Validation failed", validation.error.errors);
    }

    const [module] = await db
      .insert(researchModules)
      .values(validation.data)
      .returning();

    res.json({
      status: "success",
      data: module
    });
  }));

  app.put("/api/admin/modules/:id", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const validation = moduleSchema.partial().safeParse(req.body);
    
    if (!validation.success) {
      throw new APIError(400, "Validation failed", validation.error.errors);
    }

    const [module] = await db
      .update(researchModules)
      .set({
        ...validation.data,
        updatedAt: new Date()
      })
      .where(eq(researchModules.id, parseInt(req.params.id)))
      .returning();

    res.json({
      status: "success",
      data: module
    });
  }));
}