"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { mealPlan, mealSlot, shoppingItem, shoppingPlan } from "@maqrivo/db";
import { getSessionContext } from "../session";

const shoppingItemStatusSchema = z.enum(["pending", "purchased", "unavailable", "skipped"]);

export async function toggleSlotLockAction(slotId: string): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false };
  const row = (
    await db
      .select({ slot: mealSlot })
      .from(mealSlot)
      .innerJoin(mealPlan, eq(mealSlot.mealPlanId, mealPlan.id))
      .where(and(eq(mealSlot.id, slotId), eq(mealPlan.userId, session.userId)))
      .limit(1)
  )[0];
  if (!row) return { ok: false };
  await db
    .update(mealSlot)
    .set({ locked: !row.slot.locked })
    .where(eq(mealSlot.id, slotId));
  revalidatePath("/week");
  revalidatePath("/");
  return { ok: true };
}

export async function setSlotRecipeAction(slotId: string, recipeId: string | null): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false };
  const row = (
    await db
      .select({ id: mealSlot.id })
      .from(mealSlot)
      .innerJoin(mealPlan, eq(mealSlot.mealPlanId, mealPlan.id))
      .where(and(eq(mealSlot.id, slotId), eq(mealPlan.userId, session.userId)))
      .limit(1)
  )[0];
  if (!row) return { ok: false };
  await db
    .update(mealSlot)
    .set({ recipeId, locked: recipeId !== null })
    .where(eq(mealSlot.id, slotId));
  revalidatePath("/week");
  return { ok: true };
}

export async function setShoppingItemStatusAction(
  itemId: string,
  status: "pending" | "purchased" | "unavailable" | "skipped",
): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false };
  const parsed = shoppingItemStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false };
  const row = (
    await db
      .select({ id: shoppingItem.id })
      .from(shoppingItem)
      .innerJoin(shoppingPlan, eq(shoppingItem.shoppingPlanId, shoppingPlan.id))
      .where(and(eq(shoppingItem.id, itemId), eq(shoppingPlan.userId, session.userId)))
      .limit(1)
  )[0];
  if (!row) return { ok: false };
  await db
    .update(shoppingItem)
    .set({ status: parsed.data })
    .where(eq(shoppingItem.id, itemId));
  revalidatePath("/shopping");
  revalidatePath("/");
  return { ok: true };
}
