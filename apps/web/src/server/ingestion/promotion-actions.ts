"use server";

import { createManualPromotion } from "./promotions";
import { getSessionContext } from "../session";

/** Thin server-action surface so client components never bundle the db. */
export async function createManualPromotionAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  return createManualPromotion(input);
}
