/**
 * Stage 3 (scheduling audit S2): notification delivery core.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryStorage } from "./test/memory-storage";
import { createTestUser } from "./test/setup";
import {
  deliverNotification,
  setPushSenderForTests,
  PushEndpointGoneError,
  type PushPayload,
} from "./notifications";
import type { PushSubscription } from "@shared/schema";

describe("deliverNotification", () => {
  let storage: MemoryStorage;
  let sent: { subscription: PushSubscription; payload: PushPayload }[];

  beforeEach(async () => {
    storage = new MemoryStorage();
    storage.setUser(createTestUser({ id: "user-1" }));
    sent = [];
    setPushSenderForTests(async (subscription, payload) => {
      sent.push({ subscription, payload });
    });
  });

  afterEach(() => {
    setPushSenderForTests(null);
  });

  const baseInput = {
    userId: "user-1",
    teamId: "team-1",
    type: "availability_reminder" as const,
    dedupeKey: "availability_reminder:team-1:2026-01-15:t7:user-1",
    title: "Are you in for Saturday?",
    body: "The group needs your availability for Jan 15.",
    url: "/schedule",
    occurrenceKey: "2026-01-15",
    stage: "t7",
  };

  it("writes the in-app notification row", async () => {
    const result = await deliverNotification(storage, baseInput);

    expect(result.delivered).toBe(true);
    const feed = await storage.getNotificationsForUser("user-1");
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe("Are you in for Saturday?");
    expect(feed[0].readAt).toBeNull();
    expect(feed[0].occurrenceKey).toBe("2026-01-15");
  });

  it("is idempotent on dedupeKey — the engine can re-run forever", async () => {
    await storage.upsertPushSubscription({
      userId: "user-1", endpoint: "https://push.example/phone", p256dh: "k", auth: "a",
    });

    await deliverNotification(storage, baseInput);
    const second = await deliverNotification(storage, baseInput);

    expect(second.delivered).toBe(false);
    expect(await storage.getNotificationsForUser("user-1")).toHaveLength(1);
    // The push went out exactly once, not once per run
    expect(sent).toHaveLength(1);
  });

  it("pushes to every subscription the user holds", async () => {
    await storage.upsertPushSubscription({
      userId: "user-1", endpoint: "https://push.example/phone", p256dh: "k", auth: "a",
    });
    await storage.upsertPushSubscription({
      userId: "user-1", endpoint: "https://push.example/laptop", p256dh: "k", auth: "a",
    });
    await storage.upsertPushSubscription({
      userId: "someone-else", endpoint: "https://push.example/other", p256dh: "k", auth: "a",
    });

    const result = await deliverNotification(storage, baseInput);

    expect(sent.map((s) => s.subscription.endpoint).sort()).toEqual([
      "https://push.example/laptop",
      "https://push.example/phone",
    ]);
    expect(sent[0].payload).toEqual({
      title: baseInput.title,
      body: baseInput.body,
      url: "/schedule",
    });
    expect(result.notification?.pushSent).toBe(true);
  });

  it("prunes subscriptions the push service reports dead", async () => {
    await storage.upsertPushSubscription({
      userId: "user-1", endpoint: "https://push.example/dead", p256dh: "k", auth: "a",
    });
    await storage.upsertPushSubscription({
      userId: "user-1", endpoint: "https://push.example/alive", p256dh: "k", auth: "a",
    });
    setPushSenderForTests(async (subscription) => {
      if (subscription.endpoint.includes("dead")) {
        throw new PushEndpointGoneError("gone");
      }
    });

    const result = await deliverNotification(storage, baseInput);

    expect(result.delivered).toBe(true);
    const remaining = await storage.getPushSubscriptionsForUser("user-1");
    expect(remaining.map((s) => s.endpoint)).toEqual(["https://push.example/alive"]);
    expect(result.notification?.pushSent).toBe(true);
  });

  it("survives a sender that throws a generic error (row still written)", async () => {
    await storage.upsertPushSubscription({
      userId: "user-1", endpoint: "https://push.example/flaky", p256dh: "k", auth: "a",
    });
    setPushSenderForTests(async () => {
      throw new Error("service 500");
    });

    const result = await deliverNotification(storage, baseInput);

    expect(result.delivered).toBe(true);
    expect(result.notification?.pushSent).toBe(false);
    // Non-gone errors must NOT prune the subscription
    expect(await storage.getPushSubscriptionsForUser("user-1")).toHaveLength(1);
  });

  it("writes the in-app row even with no sender configured", async () => {
    setPushSenderForTests(null); // no VAPID in tests → in-app only
    const result = await deliverNotification(storage, baseInput);
    expect(result.delivered).toBe(true);
    expect(result.notification?.pushSent).toBe(false);
    expect(await storage.getNotificationsForUser("user-1")).toHaveLength(1);
  });
});
