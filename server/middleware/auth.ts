import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

// Extend Express Request type to include user
declare module 'express' {
  interface Request {
    user?: any;
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Debug logging
    console.log("Session:", req.session);
    console.log("User in session:", req.session?.userId);

    if (!req.session?.userId) {
      console.log("No user ID in session");
      return res.status(401).json({
        status: "error",
        message: "Unauthorized - No session"
      });
    }

    // Get user from database
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!user || user.length === 0) {
      console.log("No user found in database");
      return res.status(401).json({
        status: "error",
        message: "Unauthorized - User not found"
      });
    }

    // Attach user to request
    req.user = user[0];
    console.log("User attached to request:", req.user);

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      status: "error",
      message: "Authentication error"
    });
  }
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // First run the auth middleware
    await requireAuth(req, res, async () => {
      // Check if user is admin
      if (!req.user?.isAdmin) {
        return res.status(403).json({
          status: "error",
          message: "Forbidden - Admin access required"
        });
      }
      next();
    });
  } catch (error) {
    console.error("Admin middleware error:", error);
    return res.status(500).json({
      status: "error",
      message: "Authentication error"
    });
  }
}; 