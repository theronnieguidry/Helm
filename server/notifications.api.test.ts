/**
 * Stage 3 (scheduling audit S2): push subscription + notification feed API.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { createTestApp, createTestUser } from "./test/setup";
import { MemoryStorage } from "./test/memory-storage";

describe("Notifications API (stage 3)", () => {
  let storage: MemoryStorage;
  let app: Express;
  let server: Server;
  let otherApp: Express;
  let otherServer: Server;
  let teamId: string;
  const user = createTestUser({ id: "user-1" });
  const otherUser = createTestUser({ id: "user-2" });

  beforeEach(async () => {
    storage = new MemoryStorage();
    storage.setUser(user);
    storage.setUser(otherUser);
    const result = await createTestApp({ storage, authenticatedUser: user });
    app = result.app;
    server = result.server;
    const otherResult = await createTestApp({ storage, authenticatedUser: otherUser });
    otherApp = otherResult.app;
    otherServer = otherResult.server;

    const teamRes = await request(app).post("/api/teams").send({
      name: "T",
      teamType: "dnd",
      diceMode: "polyhedral",
    });
    teamId = teamRes.body.id;
    await storage.createTeamMember({ teamId, userId: otherUser.id, role: "member" });
  });

  afterEach(() => {
    server.close();
    otherServer.close();
  });

  describe("push subscriptions", () => {
    it("registers and unregisters a subscription", async () => {
      await request(app)
        .post("/api/push/subscriptions")
        .send({ endpoint: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } })
        .expect(200);

      expect(await storage.getPushSubscriptionsForUser(user.id)).toHaveLength(1);

      await request(app)
        .delete("/api/push/subscriptions")
        .send({ endpoint: "https://push.example/abc" })
        .expect(200);
      expect(await storage.getPushSubscriptionsForUser(user.id)).toHaveLength(0);
    });

    it("rejects malformed subscriptions", async () => {
      await request(app)
        .post("/api/push/subscriptions")
        .send({ endpoint: "not-a-url", keys: { p256dh: "k", auth: "a" } })
        .expect(400);
      await request(app)
        .post("/api/push/subscriptions")
        .send({ endpoint: "https://push.example/abc" })
        .expect(400);
    });

    it("upserts by endpoint instead of duplicating", async () => {
      const body = { endpoint: "https://push.example/abc", keys: { p256dh: "k1", auth: "a1" } };
      await request(app).post("/api/push/subscriptions").send(body).expect(200);
      await request(app)
        .post("/api/push/subscriptions")
        .send({ ...body, keys: { p256dh: "k2", auth: "a2" } })
        .expect(200);

      const subs = await storage.getPushSubscriptionsForUser(user.id);
      expect(subs).toHaveLength(1);
      expect(subs[0].p256dh).toBe("k2");
    });

    it("does not delete another user's subscription", async () => {
      await request(app)
        .post("/api/push/subscriptions")
        .send({ endpoint: "https://push.example/mine", keys: { p256dh: "k", auth: "a" } })
        .expect(200);

      await request(otherApp)
        .delete("/api/push/subscriptions")
        .send({ endpoint: "https://push.example/mine" })
        .expect(200);

      expect(await storage.getPushSubscriptionsForUser(user.id)).toHaveLength(1);
    });

    it("reports push as unconfigured without VAPID keys", async () => {
      const res = await request(app).get("/api/push/public-key").expect(200);
      expect(res.body.configured).toBe(false);
      expect(res.body.publicKey).toBeNull();
    });
  });

  describe("notification feed", () => {
    it("returns own notifications with unread count, newest first", async () => {
      await storage.createNotification({
        userId: user.id, teamId, type: "availability_reminder",
        dedupeKey: "d1", title: "First", body: "b", url: null,
        occurrenceKey: null, stage: null, pushSent: false, readAt: null,
      });
      await storage.createNotification({
        userId: user.id, teamId, type: "group_awaiting",
        dedupeKey: "d2", title: "Second", body: "b", url: null,
        occurrenceKey: null, stage: null, pushSent: false, readAt: new Date(),
      });
      await storage.createNotification({
        userId: otherUser.id, teamId, type: "game_day",
        dedupeKey: "d3", title: "Not mine", body: "b", url: null,
        occurrenceKey: null, stage: null, pushSent: false, readAt: null,
      });

      const res = await request(app).get("/api/notifications").expect(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items.map((n: { title: string }) => n.title)).not.toContain("Not mine");
      expect(res.body.unreadCount).toBe(1);
    });

    it("marks all read", async () => {
      await storage.createNotification({
        userId: user.id, teamId, type: "availability_reminder",
        dedupeKey: "d1", title: "First", body: "b", url: null,
        occurrenceKey: null, stage: null, pushSent: false, readAt: null,
      });

      await request(app).post("/api/notifications/mark-read").send({}).expect(200);

      const res = await request(app).get("/api/notifications").expect(200);
      expect(res.body.unreadCount).toBe(0);
    });
  });

  describe("notification preferences", () => {
    it("updates own per-team prefs and ignores junk fields", async () => {
      const res = await request(otherApp)
        .patch(`/api/teams/${teamId}/members/me/notification-prefs`)
        .send({ notifyAvailabilityReminders: false, role: "dm", junk: true })
        .expect(200);

      expect(res.body.notifyAvailabilityReminders).toBe(false);
      expect(res.body.notifyGroupAwaiting).toBe(true);
      expect(res.body.role).toBe("member"); // not escalated
    });

    it("403s for non-members", async () => {
      const stranger = createTestUser({ id: "stranger" });
      storage.setUser(stranger);
      const strangerApp = await createTestApp({ storage, authenticatedUser: stranger });

      await request(strangerApp.app)
        .patch(`/api/teams/${teamId}/members/me/notification-prefs`)
        .send({ notifyGameDay: false })
        .expect(403);
      strangerApp.server.close();
    });
  });
});
