/**
 * Prints a fresh VAPID key pair for web push plus the matching subject.
 * Store the two values as PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY
 * (see .env.example); they are long-lived — one pair per deployment.
 *
 * Usage: pnpm --filter @maqrivo/web generate:vapid
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("PUSH_VAPID_PUBLIC_KEY=" + publicKey);
console.log("PUSH_VAPID_PRIVATE_KEY=" + privateKey);
console.log("PUSH_SUBJECT=mailto:you@example.com");
