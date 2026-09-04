"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { mealSlot, shoppingItem } from "@maqrivo/db";
import { getSessionContext } from "../session";

export async function toggleSlotLockAction(slotId: string): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false };
  const slot = (await db.select().from(mealSlot).where(eq(mealSlot.id, slotId)).limit(1))[0];
  if (!slot) return { ok: false };
  await db
    .update(mealSlot)
    .set({ locked: !slot.locked })
    .where(eq(mealSlot.id, slotId));
  revalidatePath("/week");
  revalidatePath("/");
  return { ok: true };
}

export async function setSlotRecipeAction(slotId: string, recipeId: string | null): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false };
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
  await db
    .update(shoppingItem)
    .set({ status })
    .where(and(eq(shoppingItem.id, itemId)));
  revalidatePath("/shopping");
  revalidatePath("/");
  return { ok: true };
}
