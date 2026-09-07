/**
 * Web-push (VAPID) configuration. Free/browser-native: no third-party key.
 * Generate the key pair with `pnpm --filter @maqrivo/web generate:vapid`
 * and put both values plus PUSH_SUBJECT in the environment — unconfigured
 * push is simply hidden from the UI.
 */
export interface NotificationsConfig {
  readonly vapidPublicKey: string;
  readonly vapidPrivateKey: string;
  /** Contact URI (mailto:) sent to push services with every request. */
  readonly subject: string;
}

export type NotificationsConfigState =
  | { readonly configured: false }
  | { readonly configured: true; readonly config: NotificationsConfig };

/** Push is usable only when both VAPID keys and the subject are present. */
export function notificationsConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): NotificationsConfigState {
  const publicKey = env.PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = env.PUSH_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return { configured: false };
  return { configured: true, config: { vapidPublicKey: publicKey, vapidPrivateKey: privateKey, subject } };
}
