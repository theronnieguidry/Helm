/**
 * Notification + push subscription API handlers (scheduling audit stage 3).
 * Shared factories registered by BOTH routers, same as the notes and
 * scheduling surfaces.
 */
import type { Request, Response } from "express";
import type { IStorage } from "./storage";
import { getVapidPublicKey, isPushConfigured } from "./notifications";

type AnyRequest = Request & { user: { claims: { sub: string } } };

function getUserId(req: Request): string {
  return (req as AnyRequest).user.claims.sub;
}

/** GET /api/push/public-key — null when push is not configured on the server */
export function makePushPublicKeyHandler() {
  return async (_req: Request, res: Response) => {
    res.json({ publicKey: getVapidPublicKey(), configured: isPushConfigured() });
  };
}

/** POST /api/push/subscriptions — register this browser/device for the user */
export function makeSavePushSubscriptionHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { endpoint, keys } = req.body ?? {};
      if (
        typeof endpoint !== "string" ||
        !endpoint.startsWith("https://") ||
        typeof keys?.p256dh !== "string" ||
        typeof keys?.auth !== "string"
      ) {
        return res.status(400).json({ message: "Invalid push subscription" });
      }

      const subscription = await storage.upsertPushSubscription({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
      });
      res.json({ id: subscription.id });
    } catch (error) {
      console.error("Error saving push subscription:", error);
      res.status(500).json({ message: "Failed to save push subscription" });
    }
  };
}

/** DELETE /api/push/subscriptions — unregister by endpoint (own only) */
export function makeDeletePushSubscriptionHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { endpoint } = req.body ?? {};
      if (typeof endpoint !== "string") {
        return res.status(400).json({ message: "endpoint is required" });
      }
      // Only the owner's own subscriptions are deletable through this route
      const own = await storage.getPushSubscriptionsForUser(userId);
      if (own.some((s) => s.endpoint === endpoint)) {
        await storage.deletePushSubscriptionByEndpoint(endpoint);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting push subscription:", error);
      res.status(500).json({ message: "Failed to delete push subscription" });
    }
  };
}

/** GET /api/notifications — the user's in-app feed + unread count */
export function makeListNotificationsHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const items = await storage.getNotificationsForUser(userId, 50);
      const unreadCount = items.filter((n) => !n.readAt).length;
      res.json({ items, unreadCount });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  };
}

/** POST /api/notifications/mark-read — all, or the given ids */
export function makeMarkNotificationsReadHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { ids } = req.body ?? {};
      await storage.markNotificationsRead(
        userId,
        Array.isArray(ids) ? ids.filter((id: unknown) => typeof id === "string") : undefined
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notifications read:", error);
      res.status(500).json({ message: "Failed to mark notifications read" });
    }
  };
}

/** PATCH /api/teams/:teamId/members/me/notification-prefs */
export function makeUpdateNotificationPrefsHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const body = req.body ?? {};
      const prefs: {
        notifyAvailabilityReminders?: boolean;
        notifyGroupAwaiting?: boolean;
        notifyGameDay?: boolean;
      } = {};
      for (const field of [
        "notifyAvailabilityReminders",
        "notifyGroupAwaiting",
        "notifyGameDay",
      ] as const) {
        if (typeof body[field] === "boolean") prefs[field] = body[field];
      }

      const updated = await storage.updateMemberNotificationPrefs(member.id, prefs);
      res.json(updated);
    } catch (error) {
      console.error("Error updating notification prefs:", error);
      res.status(500).json({ message: "Failed to update notification preferences" });
    }
  };
}
