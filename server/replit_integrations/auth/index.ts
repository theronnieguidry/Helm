// Re-export storage (same for both dev and production)
export { authStorage, type IAuthStorage } from "./storage";

import type { Express, RequestHandler } from "express";

// Import both auth implementations
import * as devAuth from "./devAuth";
import * as replitAuth from "./replitAuth";
import * as prodRoutes from "./routes";

// Development auth requires BOTH conditions:
// 1. NODE_ENV === "development"
// 2. DEV_AUTH_BYPASS === "true" (explicit opt-in)
const isDevelopment =
  process.env.NODE_ENV === "development" &&
  process.env.DEV_AUTH_BYPASS === "true";

if (isDevelopment) {
  console.warn("╔════════════════════════════════════════════════════════════╗");
  console.warn("║  WARNING: Development authentication bypass is ACTIVE!     ║");
  console.warn("║  All requests are automatically authenticated.             ║");
  console.warn("║  DO NOT use this configuration in production.              ║");
  console.warn("╚════════════════════════════════════════════════════════════╝");
} else if (process.env.NODE_ENV === "development") {
  console.log("[Auth] NODE_ENV=development but DEV_AUTH_BYPASS not set - using production auth");
}

// Select the right implementation at runtime
export async function setupAuth(app: Express): Promise<void> {
  if (isDevelopment) {
    return devAuth.setupAuth(app);
  }
  return replitAuth.setupAuth(app);
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (isDevelopment) {
    return devAuth.isAuthenticated(req, res, next);
  }
  return replitAuth.isAuthenticated(req, res, next);
};

export function getSession() {
  if (isDevelopment) {
    return devAuth.getSession();
  }
  return replitAuth.getSession();
}

export function registerAuthRoutes(app: Express): void {
  if (isDevelopment) {
    return devAuth.registerAuthRoutes(app);
  }
  return prodRoutes.registerAuthRoutes(app);
}
