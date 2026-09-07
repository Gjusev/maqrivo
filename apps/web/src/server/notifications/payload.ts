import type { NewOffersDigestItem } from "../ingestion/digest";

/**
 * Push payload for the daily digest. Kept pure (no db, no next-intl) so the
 * pg-boss worker composes it and vitest pins the format.
 */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * The daily job runs outside any React/next-intl request scope, so
 * Notifications.dailyTitle is mirrored here from messages/{en,fr}.json.
 * messages-parity.test.ts keeps the key present in both locales; this map
 * must be updated alongside it if the copy changes.
 */
export const DAILY_TITLES: Record<"en" | "fr", string> = {
  en: "New deals at your stores",
  fr: "Nouveautés dans vos magasins",
};

const BODY_MAX_CHARS = 100;

/**
 * Title in the user's locale; body = top deal "description · Retailer"
 * truncated to 100 chars, plus "+N" when more deals are waiting. With no
 * rows to quote it falls back to the bare count.
 */
export function buildDigestPayload(
  total: number,
  top: NewOffersDigestItem | null,
  locale: string,
): PushPayload {
  const title = DAILY_TITLES[locale as keyof typeof DAILY_TITLES] ?? DAILY_TITLES.fr;
  let body = top ? `${top.descriptionRaw} · ${top.retailerName}` : String(total);
  if (body.length > BODY_MAX_CHARS) body = body.slice(0, BODY_MAX_CHARS);
  if (top && total > 1) body += ` +${String(total - 1)}`;
  return { title, body, url: "/offers" };
}
