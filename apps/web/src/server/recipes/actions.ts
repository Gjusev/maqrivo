"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  pantryItem,
  recipe,
  recipeIngredient,
  userRecipePrefs,
} from "@maqrivo/db";
import { getSessionContext } from "../session";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

const ingredientSchema = z.object({
  foodConceptId: z.uuid(),
  quantity: z.number().positive().max(10_000),
  unit: z.enum(["g", "kg", "ml", "l", "unit", "pack"]),
});

const recipeSchema = z.object({
  id: z.uuid().optional(),
  nameFr: z.string().min(2).max(160).optional(),
  nameEn: z.string().min(2).max(160).optional(),
  servings: z.number().int().min(1).max(20).default(2),
  prepMinutes: z.number().int().min(0).max(600).optional(),
  cookMinutes: z.number().int().min(0).max(600).optional(),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner", "snack"])).min(1),
  tags: z.array(z.string().max(30)).max(10).default([]),
  cuisine: z.string().max(40).optional(),
  instructions: z.array(z.string().min(1).max(500)).max(30).default([]),
  ingredients: z.array(ingredientSchema).min(1).max(30),
});

export async function saveRecipeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const d = parsed.data;
  if (!d.nameFr && !d.nameEn) return { ok: false, error: "name-required" };

  let recipeId = d.id;
  if (recipeId) {
    // Only the owner may edit their recipe.
    const existing = (await db.select().from(recipe).where(eq(recipe.id, recipeId)).limit(1))[0];
    if (!existing || existing.ownerUserId !== session.userId) return { ok: false, error: "forbidden" };
    await db
      .update(recipe)
      .set({
        nameFr: d.nameFr ?? existing.nameFr,
        nameEn: d.nameEn ?? existing.nameEn,
        servings: d.servings,
        prepMinutes: d.prepMinutes ?? null,
        cookMinutes: d.cookMinutes ?? null,
        mealTypes: d.mealTypes,
        tags: d.tags,
        cuisine: d.cuisine ?? null,
        instructions: d.instructions,
        ingredientVersion: existing.ingredientVersion + 1, // invalidate cached totals
        updatedAt: new Date(),
      })
      .where(eq(recipe.id, recipeId));
    await db.delete(recipeIngredient).where(eq(recipeIngredient.recipeId, recipeId));
  } else {
    const inserted = (
      await db
        .insert(recipe)
        .values({
          ownerUserId: session.userId,
          nameFr: d.nameFr ?? null,
          nameEn: d.nameEn ?? null,
          servings: d.servings,
          prepMinutes: d.prepMinutes ?? null,
          cookMinutes: d.cookMinutes ?? null,
          mealTypes: d.mealTypes,
          tags: d.tags,
          cuisine: d.cuisine ?? null,
          instructions: d.instructions,
          source: "user",
        })
        .returning()
    )[0]!;
    recipeId = inserted.id;
  }

  for (const ing of d.ingredients) {
    await db.insert(recipeIngredient).values({
      recipeId,
      foodConceptId: ing.foodConceptId,
      quantity: String(ing.quantity),
      unit: ing.unit,
    });
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true, data: { id: recipeId } };
}

export async function deleteRecipeAction(recipeId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  await db.delete(recipe).where(and(eq(recipe.id, recipeId), eq(recipe.ownerUserId, session.userId)));
  revalidatePath("/recipes");
  return { ok: true };
}

export async function duplicateRecipeAction(recipeId: string): Promise<ActionResult<{ id: string }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const source = (
    await db
      .select()
      .from(recipe)
      .where(and(eq(recipe.id, recipeId), or(eq(recipe.ownerUserId, session.userId), isNull(recipe.ownerUserId))))
      .limit(1)
  )[0];
  if (!source) return { ok: false, error: "not-found" };

  const copy = (
    await db
      .insert(recipe)
      .values({
        ownerUserId: session.userId,
        nameFr: source.nameFr ? `${source.nameFr} (copie)` : null,
        nameEn: source.nameEn ? `${source.nameEn} (copy)` : null,
        servings: source.servings,
        prepMinutes: source.prepMinutes,
        cookMinutes: source.cookMinutes,
        mealTypes: source.mealTypes,
        tags: source.tags,
        cuisine: source.cuisine,
        instructions: source.instructions,
        source: "user",
      })
      .returning()
  )[0]!;
  const ings = await db.select().from(recipeIngredient).where(eq(recipeIngredient.recipeId, recipeId));
  for (const ing of ings) {
    await db.insert(recipeIngredient).values({
      recipeId: copy.id,
      foodConceptId: ing.foodConceptId,
      quantity: ing.quantity,
      unit: ing.unit,
      isOptional: ing.isOptional,
      note: ing.note,
    });
  }
  revalidatePath("/recipes");
  return { ok: true, data: { id: copy.id } };
}

export async function toggleFavoriteRecipeAction(recipeId: string): Promise<ActionResult<{ favorite: boolean }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const existing = (
    await db
      .select()
      .from(userRecipePrefs)
      .where(and(eq(userRecipePrefs.userId, session.userId), eq(userRecipePrefs.recipeId, recipeId)))
      .limit(1)
  )[0];
  if (existing?.favorite) {
    await db.delete(userRecipePrefs).where(eq(userRecipePrefs.id, existing.id));
    revalidatePath("/recipes");
    return { ok: true, data: { favorite: false } };
  }
  await db
    .insert(userRecipePrefs)
    .values({ userId: session.userId, recipeId, favorite: true })
    .onConflictDoNothing();
  revalidatePath("/recipes");
  return { ok: true, data: { favorite: true } };
}

// ── Pantry ──────────────────────────────────────────────────────────────────

const pantrySchema = z.object({
  foodConceptId: z.uuid().optional(),
  productId: z.uuid().optional(),
  label: z.string().max(120).optional(),
  quantity: z.number().positive().max(100_000),
  unit: z.enum(["g", "kg", "ml", "l", "unit", "pack"]).default("g"),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function addPantryItemAction(input: unknown): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const parsed = pantrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const d = parsed.data;
  if (!d.foodConceptId && !d.productId && !d.label) return { ok: false, error: "item-required" };
  await db.insert(pantryItem).values({
    userId: session.userId,
    foodConceptId: d.foodConceptId ?? null,
    productId: d.productId ?? null,
    label: d.label ?? null,
    quantity: String(d.quantity),
    unit: d.unit,
    expiresOn: d.expiresOn ?? null,
  });
  revalidatePath("/pantry");
  return { ok: true };
}

export async function adjustPantryQuantityAction(itemId: string, delta: number): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const item = (
    await db
      .select()
      .from(pantryItem)
      .where(and(eq(pantryItem.id, itemId), eq(pantryItem.userId, session.userId)))
      .limit(1)
  )[0];
  if (!item) return { ok: false, error: "not-found" };
  const next = Math.max(0, Number(item.quantity) + delta);
  await db
    .update(pantryItem)
    .set({ quantity: String(Math.round(next * 1000) / 1000), status: next === 0 ? "used_up" : item.status, updatedAt: new Date() })
    .where(eq(pantryItem.id, itemId));
  revalidatePath("/pantry");
  return { ok: true };
}

export async function setPantryStatusAction(
  itemId: string,
  status: "active" | "used_up" | "discarded" | "consumed_by_plan",
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  await db
    .update(pantryItem)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(pantryItem.id, itemId), eq(pantryItem.userId, session.userId)));
  revalidatePath("/pantry");
  return { ok: true };
}

export async function deletePantryItemAction(itemId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  await db
    .delete(pantryItem)
    .where(and(eq(pantryItem.id, itemId), eq(pantryItem.userId, session.userId)));
  revalidatePath("/pantry");
  return { ok: true };
}
