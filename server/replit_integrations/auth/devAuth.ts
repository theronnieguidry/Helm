/**
 * Development-mode authentication bypass.
 * Provides mock auth for local development without Replit.
 */
import * as crypto from "crypto";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import MemoryStore from "memorystore";
import { authStorage } from "./storage";

// Generate a random session secret for development if not provided
// This ensures sessions are invalidated on restart (acceptable for dev)
function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  console.warn(
    "[Dev Auth] WARNING: SESSION_SECRET not set. Using random secret - sessions will not persist across restarts."
  );
  return crypto.randomBytes(32).toString("hex");
}

const DEV_SESSION_SECRET = getSessionSecret();

// Mock user for local development
const DEV_USER_ID = "local-dev-user";
const DEV_USER = {
  claims: {
    sub: DEV_USER_ID,
    email: "dev@localhost",
    first_name: "Local",
    last_name: "Developer",
  },
};

export function getSession() {
  const MemStore = MemoryStore(session);
  return session({
    secret: DEV_SESSION_SECRET,
    store: new MemStore({ checkPeriod: 86400000 }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Allow HTTP in development
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

export async function setupAuth(app: Express) {
  app.use(getSession());

  // Auto-create dev user in database on startup
  try {
    await authStorage.upsertUser({
      id: DEV_USER_ID,
      email: DEV_USER.claims.email,
      firstName: DEV_USER.claims.first_name,
      lastName: DEV_USER.claims.last_name,
      profileImageUrl: null,
    });
    console.log("[Dev Auth] Created/updated dev user in database");
  } catch (error) {
    console.warn("[Dev Auth] Could not create dev user:", error);
  }

  // Mock login endpoint - redirects to home (already "logged in")
  app.get("/api/login", (_req, res) => {
    res.redirect("/");
  });

  // Mock logout endpoint
  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });

  console.log("[Dev Auth] Development authentication enabled - auto-logged in as dev user");
}

export const isAuthenticated: RequestHandler = (req, _res, next) => {
  // Always authenticated in development mode
  (req as any).user = DEV_USER;
  (req as any).isAuthenticated = () => true;
  next();
};

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (user) {
        res.json(user);
      } else {
        // Return mock user data if not in DB yet
        res.json({
          id: DEV_USER_ID,
          email: DEV_USER.claims.email,
          firstName: DEV_USER.claims.first_name,
          lastName: DEV_USER.claims.last_name,
          profileImageUrl: null,
        });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
