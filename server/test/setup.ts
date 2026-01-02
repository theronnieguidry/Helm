import express, { type Express, type RequestHandler } from "express";
import { createServer, type Server } from "http";
import type { IStorage } from "../storage";
import { MemoryStorage } from "./memory-storage";

export interface TestUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface TestAppOptions {
  storage?: IStorage;
  authenticatedUser?: TestUser | null;
}

export function createMockAuthMiddleware(user: TestUser | null): RequestHandler {
  return (req: any, res, next) => {
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.user = {
      claims: {
        sub: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
      },
      access_token: "test-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    req.isAuthenticated = () => true;
    next();
  };
}

export async function createTestApp(options: TestAppOptions = {}): Promise<{
  app: Express;
  server: Server;
  storage: IStorage;
}> {
  const storage = options.storage || new MemoryStorage();
  const app = express();
  const server = createServer(app);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const authMiddleware = createMockAuthMiddleware(options.authenticatedUser ?? null);

  const { registerTestRoutes } = await import("./test-routes");
  await registerTestRoutes(app, storage, authMiddleware);

  return { app, server, storage };
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: `test-user-${Date.now()}`,
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    ...overrides,
  };
}
