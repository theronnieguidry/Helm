/**
 * Notification delivery core (scheduling audit stage 3, S2).
 *
 * One entry point — deliverNotification — used by the reminder engine and the
 * event triggers. Every delivery:
 *   1. checks the dedupeKey ledger (a unique column), so re-runs, catch-up
 *      sweeps, and concurrent triggers can never double-send;
 *   2. writes the in-app notification row (the zero-permission fallback that
 *      always works);
 *   3. attempts Web Push to every subscription the target user holds,
 *      pruning endpoints the push service reports dead (404/410).
 *
 * Web Push is configured via env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and
 * optionally VAPID_SUBJECT (mailto: or https: URL). When unset, push is
 * silently disabled and only the in-app feed is written — dev and test
 * environments need no keys.
 */
import webpush from "web-push";
import type { IStorage } from "./storage";
import type { InsertNotification, Notification, PushSubscription } from "@shared/schema";

export interface PushPayload {
  title: string;
  body: string;
  url?: string | null;
}

export type PushSender = (
  subscription: PushSubscription,
  payload: PushPayload
) => Promise<void>;

export class PushEndpointGoneError extends Error {}

let vapidConfigured = false;

export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function ensureVapid(): void {
  if (vapidConfigured || !isPushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@helm.local",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidConfigured = true;
}

const realPushSender: PushSender = async (subscription, payload) => {
  ensureVapid();
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      throw new PushEndpointGoneError();
    }
    throw error;
  }
};

// Injectable for tests (and disabled entirely when VAPID is unset)
let pushSender: PushSender | null = null;

export function setPushSenderForTests(sender: PushSender | null): void {
  pushSender = sender;
}

function getPushSender(): PushSender | null {
  if (pushSender) return pushSender;
  return isPushConfigured() ? realPushSender : null;
}

export interface DeliverInput {
  userId: string;
  teamId: string;
  type: InsertNotification["type"];
  dedupeKey: string;
  title: string;
  body: string;
  url?: string;
  occurrenceKey?: string;
  stage?: string;
}

export interface DeliverResult {
  delivered: boolean; // false when the dedupe ledger already had this key
  notification?: Notification;
}

export async function deliverNotification(
  storage: IStorage,
  input: DeliverInput
): Promise<DeliverResult> {
  // Idempotency ledger: one dedupeKey, one delivery, forever
  const existing = await storage.getNotificationByDedupeKey(input.dedupeKey);
  if (existing) {
    return { delivered: false };
  }

  let notification: Notification;
  try {
    notification = await storage.createNotification({
      userId: input.userId,
      teamId: input.teamId,
      type: input.type,
      dedupeKey: input.dedupeKey,
      title: input.title,
      body: input.body,
      url: input.url ?? null,
      occurrenceKey: input.occurrenceKey ?? null,
      stage: input.stage ?? null,
      pushSent: false,
      readAt: null,
    });
  } catch (error) {
    // Unique-constraint race with a concurrent delivery: someone else won
    if (String(error).includes("unique")) {
      return { delivered: false };
    }
    throw error;
  }

  const sender = getPushSender();
  if (sender) {
    const subscriptions = await storage.getPushSubscriptionsForUser(input.userId);
    let anySent = false;
    for (const subscription of subscriptions) {
      try {
        await sender(subscription, {
          title: input.title,
          body: input.body,
          url: input.url ?? null,
        });
        anySent = true;
      } catch (error) {
        if (error instanceof PushEndpointGoneError) {
          // The push service says this device is gone — prune it
          await storage.deletePushSubscriptionByEndpoint(subscription.endpoint).catch(() => {});
        } else {
          console.error("Web push send failed:", error);
        }
      }
    }
    if (anySent) {
      await storage.updateNotificationPushSent(notification.id, true);
      notification = { ...notification, pushSent: true };
    }
  }

  return { delivered: true, notification };
}
