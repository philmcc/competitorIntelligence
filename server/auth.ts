import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, loginUserSchema, type User as SelectUser } from "db/schema";
import { db } from "db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { APIError } from "./errors";
import { logger } from "./utils/logger";

const scryptAsync = promisify(scrypt);
const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(
      suppliedPassword,
      salt,
      64
    )) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Enhanced response handler with consistent format and headers
const handleAuthResponse = (res: Response, status: number, message: string, data?: any) => {
  // Always set content type and other security headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  const response = {
    status: status < 400 ? "success" : "error",
    message,
    ...(data && { data }),
    timestamp: new Date().toISOString(),
    requestId: res.locals.requestId
  };

  return res.status(status).json(response);
};

// Enhanced error handler for authentication routes
const handleAuthError = (err: any, req: Request, res: Response) => {
  const errorContext = {
    error: err.message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    requestId: res.locals.requestId,
    timestamp: new Date().toISOString()
  };

  logger.error('Authentication error:', errorContext);

  if (err instanceof z.ZodError) {
    return handleAuthResponse(res, 400, "Validation failed", {
      errors: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    });
  }

  if (err instanceof APIError) {
    return handleAuthResponse(res, err.statusCode, err.message, {
      errors: err.errors
    });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    logger.error('JSON parsing error:', {
      ...errorContext,
      contentType: req.get('content-type')
    });
    
    return handleAuthResponse(res, 400, "Invalid JSON payload", {
      error: process.env.NODE_ENV === 'development' ? err.message : "Malformed request data"
    });
  }

  return handleAuthResponse(res, 500, "Authentication failed");
};

export function setupAuth(app: Express) {
  console.log('Setting up auth routes...');

  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || process.env.REPL_ID || "development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: app.get("env") === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    },
    store: new MemoryStore({
      checkPeriod: 86400000,
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Request ID middleware for better error tracking
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.requestId = `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    next();
  });

  // JSON parsing error handler middleware for auth routes
  const handleJsonParsingError = (err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      logger.error("JSON parsing error in auth route:", {
        error: err.message,
        path: req.path,
        method: req.method,
        contentType: req.get("content-type"),
        ip: req.ip,
        requestId: res.locals.requestId,
        timestamp: new Date().toISOString()
      });

      return handleAuthResponse(res, 400, "Invalid JSON payload", {
        error: process.env.NODE_ENV === "development" ? err.message : "Malformed request data",
        details: {
          contentType: req.get("content-type"),
          expectedType: "application/json"
        }
      });
    }
    next(err);
  };

  // Apply JSON parsing error handler to auth routes
  app.use(["/register", "/login"], handleJsonParsingError);

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          return done(null, false, { message: "Invalid credentials" });
        }
        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Invalid credentials" });
        }
        return done(null, user);
      } catch (err) {
        logger.error("Authentication error:", err);
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      
      if (!user) {
        return done(null, false);
      }
      
      done(null, user);
    } catch (err) {
      logger.error("Deserialization error:", err);
      done(err);
    }
  });

  app.post("/api/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return handleAuthResponse(res, 400, "Invalid input", {
          errors: result.error.errors
        });
      }

      const { username, password, email } = result.data;
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return handleAuthResponse(res, 409, "Username already exists");
      }

      const hashedPassword = await crypto.hash(password);
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          email,
          plan: "free"
        })
        .returning();

      req.login(newUser, (err) => {
        if (err) {
          return next(err);
        }
        handleAuthResponse(res, 200, "Registration successful", {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email
        });
      });
    } catch (error) {
      handleAuthError(error, req, res);
    }
  });

  app.post("/api/login", async (req: Request, res: Response, next: NextFunction) => {
    console.log('Login attempt received:', {
      body: req.body,
      headers: req.headers
    });
    
    try {
      const result = loginUserSchema.safeParse(req.body);
      if (!result.success) {
        return handleAuthResponse(res, 400, "Invalid input", {
          errors: result.error.errors
        });
      }

      passport.authenticate("local", (err: Error | null, user: Express.User | false, info: IVerifyOptions) => {
        if (err) {
          return handleAuthError(err, req, res);
        }

        if (!user) {
          return handleAuthResponse(res, 401, info.message ?? "Invalid credentials");
        }

        req.login(user, (loginErr) => {
          if (loginErr) {
            return handleAuthError(loginErr, req, res);
          }

          return handleAuthResponse(res, 200, "Login successful", {
            id: user.id,
            username: user.username,
            email: user.email
          });
        });
      })(req, res, next);
    } catch (error) {
      handleAuthError(error, req, res);
    }
  });

  app.post("/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        logger.error("Logout error:", {
          error: err.message,
          requestId: res.locals.requestId,
          timestamp: new Date().toISOString()
        });
        return handleAuthResponse(res, 500, "Logout failed");
      }
      handleAuthResponse(res, 200, "Logout successful");
    });
  });

  app.get("/api/user", (req: Request, res: Response) => {
    if (req.isAuthenticated()) {
      return handleAuthResponse(res, 200, "User data retrieved", req.user);
    }
    handleAuthResponse(res, 401, "Unauthorized");
  });
}
