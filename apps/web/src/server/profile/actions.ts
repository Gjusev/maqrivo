"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { nutritionProfile, userPreferences, user as userTable } from "@maqrivo/db";
import { getSessionContext } from "../session";

/**
 * Nutrition profile editing. Targets are stored as a new row (history kept,
 * latest wins) per docs/domain_model.md — and never AI-computed.
 */
const profileSchema = z.object({
  dailyKcal: z.coerce.number().int().min(500).max(8000).optional(),
  proteinG: z.coerce.number().int().min(0).max(500).optional(),
  carbohydrateG: z.coerce.number().int().min(0).max(1200).optional(),
  fatG: z.coerce.number().int().min(0).max(500).optional(),
  fiberG: z.coerce.number().int().min(0).max(200).optional(),
  mealsPerDay: z.coerce.number().int().min(1).max(6).default(3),
  weeklyBudgetEuros: z.coerce.number().min(0).max(2000).optional(),
  halalRequired: z.boolean().default(false),
  allowUnknownHalal: z.boolean().default(false),
  vegetarian: z.boolean().default(false),
  vegan: z.boolean().default(false),
  autoRefreshPlan: z.boolean().default(false),
  allergens: z.array(z.string().max(40)).max(20).default([]),
});

export async function saveNutritionProfileAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const d = parsed.data;

  await db.insert(nutritionProfile).values({
    userId: session.userId,
    dailyKcal: d.dailyKcal ?? null,
    proteinG: d.proteinG ?? null,
    carbohydrateG: d.carbohydrateG ?? null,
    fatG: d.fatG ?? null,
    fiberG: d.fiberG ?? null,
    mealsPerDay: d.mealsPerDay,
    weeklyBudgetCents: d.weeklyBudgetEuros !== undefined ? Math.round(d.weeklyBudgetEuros * 100) : null,
    halalRequired: d.halalRequired,
    vegetarian: d.vegetarian,
    vegan: d.vegan,
    autoRefreshPlan: d.autoRefreshPlan,
    allergens: d.allergens,
  });
  // Preferences row may not exist yet on fresh accounts.
  const existing = (await db.select().from(userPreferences).where(eq(userPreferences.userId, session.userId)).limit(1))[0];
  if (!existing) {
    await db.insert(userPreferences).values({ userId: session.userId });
  }
  revalidatePath("/profile");
  revalidatePath("/");
  return { ok: true };
}

/** GDPR-style deletion: cascades remove every user-owned row. Irreversible. */
export async function deleteAccountAction(): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  try {
    // Better Auth session rows cascade with the user row.
    await db.delete(userTable).where(eq(userTable.id, session.userId));
    return { ok: true };
  } catch {
    return { ok: false, error: "delete-failed" };
  }
}
