/**
 * Client-side Web Push plumbing (scheduling audit stage 3).
 *
 * The permission prompt is never fired on page load — call
 * enablePushNotifications() from a user gesture (the settings toggle, or the
 * post-availability-save nudge).
 */
import { apiRequest } from "@/lib/queryClient";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  return isPushSupported() ? Notification.permission : "unsupported";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.error("Service worker registration failed:", error);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

/**
 * Full enable flow: permission prompt → SW subscription → server registration.
 * Returns a status the caller can surface.
 */
export async function enablePushNotifications(): Promise<
  "subscribed" | "denied" | "unsupported" | "unconfigured" | "error"
> {
  if (!isPushSupported()) return "unsupported";

  try {
    const keyRes = await apiRequest("GET", "/api/push/public-key");
    const { publicKey } = (await keyRes.json()) as { publicKey: string | null };
    if (!publicKey) return "unconfigured";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const registration = await registerServiceWorker();
    if (!registration) return "error";
    await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const json = subscription.toJSON();
    await apiRequest("POST", "/api/push/subscriptions", {
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    });

    return "subscribed";
  } catch (error) {
    console.error("Enabling push notifications failed:", error);
    return "error";
  }
}

/** Whether THIS browser currently holds a push subscription. */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

export async function disablePushNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await apiRequest("DELETE", "/api/push/subscriptions", {
        endpoint: subscription.endpoint,
      }).catch(() => {});
      await subscription.unsubscribe();
    }
  } catch (error) {
    console.error("Disabling push notifications failed:", error);
  }
}
