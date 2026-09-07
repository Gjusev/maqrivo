/**
 * Pure push helpers — no DOM/browser APIs — so vitest (node) and the
 * client toggle share one implementation.
 */

/**
 * Standard VAPID conversion: the server hands out a base64url
 * `applicationServerKey`, pushManager.subscribe wants the raw bytes.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 === 0 ? 0 : 4 - (base64.length % 4);
  const raw = atob(base64 + "=".repeat(padding));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
