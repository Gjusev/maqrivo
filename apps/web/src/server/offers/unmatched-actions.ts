"use server";

import { getSessionContext } from "../session";
import { resolvePromotionMatch } from "./unmatched";

/** Thin server-action surface so client components never bundle the db. */
export async function resolvePromotionMatchAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  return resolvePromotionMatch(session.userId, input);
}
