/**
 * Daily digest push: one notification per subscribed user whose scoped
 * store scope gained promotions in the last 7 days (same payload as the
 * dashboard's NewOffersCard). Dead subscriptions (404/410 from the push
 * service) are pruned; any other per-user failure never aborts the sweep.
 */
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { pushSubscription, usersProfile } from "@maqrivo/db";
import { getNewOffersDigest } from "../ingestion/digest";
import { notificationsConfig } from "./config";
import { buildDigestPayload } from "./payload";

export interface DailyDigestPushResult {
  users: number;
  notified: number;
  pruned: number;
}

export async function runDailyDigestPush(): Promise<DailyDigestPushResult> {
  const state = notificationsConfig();
  if (!state.configured) return { users: 0, notified: 0, pruned: 0 };
  const { subject, vapidPublicKey, vapidPrivateKey } = state.config;

  const subscribers = await db.selectDistinct({ userId: pushSubscription.userId }).from(pushSubscription);
  let notified = 0;
  let pruned = 0;

  for (const { userId } of subscribers) {
    try {
      const digest = await getNewOffersDigest(userId);
      if (digest.total <= 0) continue;
      const profile = (
        await db.select({ locale: usersProfile.locale }).from(usersProfile).where(eq(usersProfile.userId, userId)).limit(1)
      )[0];
      const payload = JSON.stringify(buildDigestPayload(digest.total, digest.items[0] ?? null, profile?.locale ?? "fr"));

      const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { vapidDetails: { subject, publicKey: vapidPublicKey, privateKey: vapidPrivateKey } },
          );
          notified++;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Push service says the subscription is gone — drop the row.
            await db.delete(pushSubscription).where(eq(pushSubscription.id, sub.id));
            pruned++;
          } else {
            console.warn(`[daily-push] user ${userId}: send failed (${String(status ?? "unknown")})`);
          }
        }
      }
    } catch (error) {
      console.error(`[daily-push] user ${userId} failed`, error);
    }
  }

  return { users: subscribers.length, notified, pruned };
}
