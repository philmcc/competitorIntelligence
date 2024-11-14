import { Request, Response, NextFunction } from "express";
import { APIError } from "../errors";

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    throw new APIError(401, "Unauthorized");
  }
  
  if (!req.user.isAdmin) {
    throw new APIError(403, "Forbidden - Admin access required");
  }
  
  next();
}
