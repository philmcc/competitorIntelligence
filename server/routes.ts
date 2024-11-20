import { Express, Request, Response, NextFunction } from "express";
import { setupAuth } from "./auth";
import { db } from "db";
import { competitors, reports, subscriptions, users, researchModules, userModules, websiteChanges, websiteResearchResults } from "db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { createCustomer, createSubscription, cancelSubscription } from "./stripe";
import Stripe from "stripe";
import fetch from "node-fetch";
import { z } from "zod";
import { APIError } from "./errors";
import { requireAdmin } from "./middleware/admin";
import { moduleSchema, moduleUpdateSchema } from "./schemas";
import { trackWebsiteChanges, trackAllCompetitors } from './utils/website-tracker';
import { analyzeTrustpilotReviews, getStoredTrustpilotReviews } from './utils/trustpilot-analyzer';
import { scheduleJob } from 'node-schedule';

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
    try {
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
        data: modules,
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      throw new APIError(500, "Failed to fetch research modules", 
        error instanceof Error ? [{ 
          code: "fetch_error", 
          message: error.message 
        }] : undefined
      );
    }
  }));

  app.post("/api/admin/modules", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const validation = moduleSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new APIError(400, "Validation failed", validation.error.errors);
    }

    try {
      const [module] = await db
        .insert(researchModules)
        .values({
          ...validation.data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      res.json({
        status: "success",
        data: module,
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('unique constraint')) {
        throw new APIError(409, "Module with this name already exists");
      }
      throw new APIError(500, "Failed to create research module", 
        error instanceof Error ? [{ 
          code: "create_error", 
          message: error.message 
        }] : undefined
      );
    }
  }));

  // Trustpilot endpoints
  app.post("/api/admin/competitors/:id/trustpilot", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const competitorId = parseInt(req.params.id);
    
    // Check if competitor exists and belongs to user
    const [competitor] = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, competitorId));

    if (!competitor) {
      throw new APIError(404, "Competitor not found");
    }

    try {
      const result = await analyzeTrustpilotReviews(competitorId, competitor.website);
      
      if (result.success) {
        // Update competitor with discovered Trustpilot URL if available
        if (result.trustpilot_url) {
          await db.update(competitors)
            .set({ customFields: { ...competitor.customFields, trustpilot_url: result.trustpilot_url } })
            .where(eq(competitors.id, competitorId));
        }

        res.json({
          status: "success",
          data: {
            reviews: result.reviews || [],
            trustpilot_url: result.trustpilot_url,
            message: result.message
          }
        });
      } else {
        res.status(400).json({
          status: "error",
          message: result.message || "Failed to analyze Trustpilot reviews",
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Error in Trustpilot analysis endpoint', {
        error,
        competitorId,
        website: competitor.website
      });
      res.status(500).json({
        status: "error",
        message: "Internal server error processing Trustpilot reviews",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }));

  app.get("/api/admin/competitors/:id/trustpilot", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const competitorId = parseInt(req.params.id);
    
    // Check if competitor exists and belongs to user
    const [competitor] = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, competitorId));

    if (!competitor) {
      throw new APIError(404, "Competitor not found");
    }

    try {
      const reviews = await getStoredTrustpilotReviews(competitorId);
      
      res.json({
        status: "success",
        data: {
          reviews,
          trustpilot_url: competitor.customFields?.trustpilot_url
        }
      });
    } catch (error) {
      console.error('Error fetching Trustpilot reviews:', error);
      throw new APIError(500, "Failed to fetch Trustpilot reviews");
    }
  }));

  app.post("/api/admin/competitors/:id/trustpilot", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const competitorId = parseInt(req.params.id);
    
    // Check if competitor exists and belongs to user
    const [competitor] = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, competitorId));

    if (!competitor) {
      throw new APIError(404, "Competitor not found");
    }

    try {
      const result = await analyzeTrustpilotReviews(competitorId, competitor.website);
      
      if (!result.success) {
        throw new APIError(400, result.message || "Failed to analyze Trustpilot reviews");
      }

      res.json({
        status: "success",
        data: {
          reviews: result.reviews,
          message: `Successfully analyzed ${result.reviews?.length || 0} reviews`
        }
      });
    } catch (error) {
      console.error('Error analyzing Trustpilot reviews:', error);
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to analyze Trustpilot reviews");
    }
  }));

  app.put("/api/admin/modules/:id", requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const validation = moduleUpdateSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new APIError(400, "Validation failed", validation.error.errors);
    }

    const moduleId = parseInt(req.params.id);
    if (isNaN(moduleId)) {
      throw new APIError(400, "Invalid module ID");
    }

    try {
      // Check if module exists
      const [existingModule] = await db
        .select()
        .from(researchModules)
        .where(eq(researchModules.id, moduleId));

      if (!existingModule) {
        throw new APIError(404, "Module not found");
      }

      const [module] = await db
        .update(researchModules)
        .set({
          ...validation.data,
          updatedAt: new Date()
        })
        .where(eq(researchModules.id, moduleId))
        .returning();

      res.json({
        status: "success",
        data: module,
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, "Failed to update research module", 
        error instanceof Error ? [{ 
          code: "update_error", 
          message: error.message 
        }] : undefined
      );
    }
  }));

  // Website change tracking endpoints
  app.post("/api/competitors/:id/track", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const competitorId = parseInt(req.params.id);
    
    // Verify competitor belongs to user
    const [competitor] = await db
      .select()
      .from(competitors)
      .where(and(
        eq(competitors.id, competitorId),
        eq(competitors.userId, req.user!.id)
      ));

    if (!competitor) {
      throw new APIError(404, "Competitor not found");
    }

    const changes = await trackWebsiteChanges(competitorId, competitor.website);
    
    res.json({
      status: "success",
      data: changes
    });
  }));

  app.get("/api/competitors/:id/changes", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const competitorId = parseInt(req.params.id);
    
    // Verify competitor belongs to user
    const [competitor] = await db
      .select()
      .from(competitors)
      .where(and(
        eq(competitors.id, competitorId),
        eq(competitors.userId, req.user!.id)
      ));

    if (!competitor) {
      throw new APIError(404, "Competitor not found");
    }

    const changes = await db
      .select()
      .from(websiteChanges)
      .where(eq(websiteChanges.competitorId, competitorId))
      .orderBy(desc(websiteChanges.createdAt))
      .limit(10);

    res.json({
      status: "success",
      data: changes
    });
  }));

  // Report generation endpoint
  app.post("/api/reports/generate", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    // Get all selected competitors for the user
    const userCompetitors = await db
      .select()
      .from(competitors)
      .where(and(
        eq(competitors.userId, req.user!.id),
        eq(competitors.isSelected, true)
      ));

    // Get unreported changes for each competitor
    const changes = await db
      .select({
        id: websiteChanges.id,
        competitorId: websiteChanges.competitorId,
        snapshotDate: websiteChanges.snapshotDate,
        changes: websiteChanges.changes,
        changeType: websiteChanges.changeType,
        competitorName: competitors.name,
        competitorWebsite: competitors.website
      })
      .from(websiteChanges)
      .innerJoin(competitors, eq(websiteChanges.competitorId, competitors.id))
      .where(and(
        eq(websiteChanges.isReported, false),
        eq(competitors.userId, req.user!.id),
        eq(competitors.isSelected, true)
      ))
      .orderBy(desc(websiteChanges.createdAt));

    // Generate report content
    const reportContent = changes.map(change => ({
      competitor: {
        name: change.competitorName,
        website: change.competitorWebsite
      },
      date: new Date(change.snapshotDate).toLocaleDateString(),
      type: change.changeType,
      changes: change.changes
    }));

    if (reportContent.length === 0) {
      throw new APIError(400, "No new changes to report");
    }

    // Create report record
    const [report] = await db.insert(reports)
      .values({
        userId: req.user!.id,
        competitorIds: userCompetitors.map(c => c.id),
        modules: ["website-changes"],
        reportUrl: `/reports/${Date.now()}.json`, // In a real app, this would be a generated PDF/stored file
      })
      .returning();

    // Mark changes as reported
    await db.update(websiteChanges)
      .set({ isReported: true })
      .where(eq(websiteChanges.isReported, false));

    res.json({
      status: "success",
      data: {
        report,
        content: reportContent
      }
    });
  }));

  // Schedule daily website tracking
  scheduleJob('0 0 * * *', async () => {
    console.log('Running scheduled website tracking...');
    try {
      await trackAllCompetitors();
      console.log('Scheduled website tracking completed successfully');
    } catch (error) {
      console.error('Error in scheduled website tracking:', error);
    }
  });

  // Add this new route handler
  app.get('/api/admin/modules/stats', requireAdmin, async (req, res) => {
    try {
      const stats = await db
        .select({
          moduleId: userModules.moduleId,
          count: sql<number>`count(*)`,
        })
        .from(userModules)
        .where(eq(userModules.isEnabled, true))
        .groupBy(userModules.moduleId);

      const statsMap = Object.fromEntries(
        stats.map(({ moduleId, count }) => [moduleId, count])
      );

      res.json({
        status: 'success',
        data: statsMap,
      });
    } catch (error) {
      console.error('Error fetching module statistics:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch module statistics'
      });
    }
  });

  // Add this new route handler
  app.get('/api/modules', async (req, res) => {
    try {
      const userId = req.user.id; // Assuming you have user in request from auth middleware
      
      const modules = await db
        .select({
          id: researchModules.id,
          name: researchModules.name,
          description: researchModules.description,
          availableOnFree: researchModules.availableOnFree,
          isActive: researchModules.isActive,
          isEnabled: userModules.isEnabled,
        })
        .from(researchModules)
        .leftJoin(userModules, and(
          eq(userModules.moduleId, researchModules.id),
          eq(userModules.userId, userId)
        ))
        .where(eq(researchModules.isActive, true));

      res.json({
        status: 'success',
        data: modules,
      });
    } catch (error) {
      console.error('Error fetching modules:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch modules'
      });
    }
  });

  // Toggle module for user
  app.post('/api/modules/:moduleId/toggle', async (req, res) => {
    try {
      const { moduleId } = req.params;
      const { enabled } = req.body;
      const userId = req.user.id;

      await db
        .insert(userModules)
        .values({
          userId,
          moduleId,
          isEnabled: enabled,
        })
        .onConflictDoUpdate({
          target: [userModules.userId, userModules.moduleId],
          set: { isEnabled: enabled },
        });

      res.json({ status: 'success' });
    } catch (error) {
      console.error('Error toggling module:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to toggle module'
      });
    }
  });

  app.get('/api/user', async (req, res) => {
    try {
      // Check for valid session
      const session = await getSession(req);
      if (!session?.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Not authenticated'
        });
      }

      // Get user data
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)
        .then(rows => rows[0]);

      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          isAdmin: user.isAdmin,
          plan: user.plan,
        }
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch user data'
      });
    }
  });

  // Update the competitors route to check auth
  app.get('/api/admin/users/:userId/competitors', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Validate userId is a number
      const userIdNum = parseInt(userId);
      if (isNaN(userIdNum)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid user ID'
        });
      }

      // Check if user exists
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userIdNum))
        .limit(1)
        .then(rows => rows[0]);

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      // Fetch competitors
      const competitors = await db
        .select({
          id: competitors.id,
          name: competitors.name,
          website: competitors.website,
          isSelected: competitors.isSelected,
          createdAt: competitors.createdAt,
          reason: competitors.reason,
        })
        .from(competitors)
        .where(eq(competitors.userId, userIdNum))
        .orderBy(competitors.createdAt);

      res.json({
        status: 'success',
        data: competitors
      });
    } catch (error) {
      console.error('Error fetching user competitors:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch competitors'
      });
    }
  });

  app.post('/api/admin/competitors/:competitorId/research', requireAdmin, async (req, res) => {
    try {
      const { competitorId } = req.params;
      const { website } = req.body;

      // Get the most recent research result
      const previousRun = await db
        .select()
        .from(websiteResearchResults)
        .where(eq(websiteResearchResults.competitorId, parseInt(competitorId)))
        .orderBy(desc(websiteResearchResults.runDate))
        .limit(1);

      const previousText = previousRun?.[0]?.currentText || 'no previous run';

      const webhookPayload = { 
        url: website,
        'old-website-text': previousText
      };

      const webhookResponse = await fetch('https://hook.eu2.make.com/q7tdf62gsing7fpf6bsepecx2fd6bvws', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });

      if (!webhookResponse.ok) {
        throw new Error('Webhook call failed');
      }

      const result = await webhookResponse.json();
      
      // Store the results with the corrected changes check
      const dbResult = await db.insert(websiteResearchResults).values({
        competitorId: parseInt(competitorId),
        currentText: result['website-text'],
        changesMade: result.changes.includes('Updates made'), // Fix the condition
        changeDetails: result.details,
      }).returning();

      // Return properly formatted response
      res.json({
        status: 'success',
        data: {
          changesMade: result.changes.includes('Updates made'), // Fix the condition
          changeDetails: result.details,
          runDate: dbResult[0].runDate
        },
      });

    } catch (error) {
      console.error('Research error:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to run research',
      });
    }
  });

  // Add this new route handler
  app.get('/api/admin/competitors/:competitorId/research-history', requireAdmin, async (req, res) => {
    try {
      const { competitorId } = req.params;
      
      // Verify competitor exists
      const [competitor] = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, parseInt(competitorId)))
        .limit(1);

      if (!competitor) {
        throw new APIError(404, "Competitor not found");
      }

      // Get research history
      const history = await db
        .select()
        .from(websiteResearchResults)
        .where(eq(websiteResearchResults.competitorId, parseInt(competitorId)))
        .orderBy(desc(websiteResearchResults.runDate));

      res.json({
        status: 'success',
        data: history
      });
    } catch (error) {
      console.error('Error fetching research history:', error);
      res.status(error instanceof APIError ? error.status : 500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch research history'
      });
    }
  });

  // Add this endpoint to get competitor details
  app.get('/api/admin/competitors/:competitorId', requireAdmin, async (req, res) => {
    try {
      const { competitorId } = req.params;
      
      const [competitor] = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, parseInt(competitorId)))
        .limit(1);

      if (!competitor) {
        throw new APIError(404, "Competitor not found");
      }

      res.json({
        status: 'success',
        data: competitor
      });
    } catch (error) {
      console.error('Error fetching competitor:', error);
      res.status(error instanceof APIError ? error.status : 500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch competitor'
      });
    }
  });

  app.post('/api/admin/competitors/:competitorId/trustpilot', requireAdmin, async (req, res) => {
    try {
      const { competitorId } = req.params;
      
      // Validate competitorId is a number
      const id = parseInt(competitorId);
      if (isNaN(id)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid competitor ID'
        });
      }

      // Get competitor details
      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, id))
        .limit(1)
        .then(rows => rows[0]);

      if (!competitor) {
        return res.status(404).json({
          status: 'error',
          message: 'Competitor not found'
        });
      }

      // Call your Trustpilot analyzer
      const result = await analyzeTrustpilotReviews(id, competitor.website);

      if (!result.success) {
        return res.status(400).json({
          status: 'error',
          message: result.message || 'Failed to analyze Trustpilot reviews'
        });
      }

      res.json({
        status: 'success',
        data: {
          reviews: result.reviews
        }
      });
    } catch (error) {
      console.error('Error analyzing Trustpilot reviews:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error while analyzing Trustpilot reviews'
      });
    }
  });
}