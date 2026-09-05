"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  foodConcept,
  priceObservation,
  product,
  productNutrition,
} from "@maqrivo/db";
import { getSessionContext } from "../session";
import { fetchOffProductV3 } from "../integrations/openfoodfacts";
import { similarity } from "@maqrivo/core";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

const manualProductSchema = z.object({
  name: z.string().min(2).max(160),
  brand: z.string().max(120).optional(),
  barcode: z.string().regex(/^\d{6,14}$/).optional().or(z.literal("")),
  category: z.string().max(80).optional(),
  foodConceptId: z.uuid().optional(),
  purchasingMode: z.enum(["PACKAGED", "WEIGHT", "UNIT"]).default("PACKAGED"),
  packageQuantity: z.number().positive().optional(),
  packageUnit: z.enum(["g", "kg", "ml", "l", "unit"]).optional(),
  halalState: z.enum(["CONFIRMED", "CLAIMED", "UNKNOWN", "NOT_HALAL"]).default("UNKNOWN"),
  vegetarian: z.boolean().optional(),
  vegan: z.boolean().optional(),
  organic: z.boolean().optional(),
  ingredients: z.string().max(2000).optional(),
  notes: z.string().max(500).optional(),
  nutrition: z
    .object({
      basis: z.enum(["100g", "100ml"]).default("100g"),
      energyKcal: z.number().min(0).max(1000).optional(),
      proteinG: z.number().min(0).max(100).optional(),
      carbohydrateG: z.number().min(0).max(100).optional(),
      fatG: z.number().min(0).max(100).optional(),
      saturatedFatG: z.number().min(0).max(100).optional(),
      fiberG: z.number().min(0).max(100).optional(),
      sugarsG: z.number().min(0).max(100).optional(),
      saltG: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export async function createProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const parsed = manualProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const d = parsed.data;

  const inserted = (
    await db
      .insert(product)
      .values({
        ownerUserId: session.userId,
        name: d.name,
        brand: d.brand || null,
        barcode: d.barcode || null,
        category: d.category || null,
        foodConceptId: d.foodConceptId || null,
        purchasingMode: d.purchasingMode,
        packageQuantity: d.packageQuantity !== undefined && d.packageUnit ? String(d.packageQuantity) : null,
        packageUnit: d.packageUnit ?? null,
        halalState: d.halalState,
        vegetarian: d.vegetarian ?? null,
        vegan: d.vegan ?? null,
        organic: d.organic ?? null,
        ingredients: d.ingredients || null,
        notes: d.notes || null,
        source: "user",
      })
      .returning()
  )[0]!;

  if (d.nutrition) {
    await insertNutrition(inserted.id, d.nutrition, "user", null);
  }

  revalidatePath("/products");
  return { ok: true, data: { id: inserted.id } };
}

type NutritionInput = {
  basis: "100g" | "100ml";
  energyKcal?: number | null;
  proteinG?: number | null;
  carbohydrateG?: number | null;
  fatG?: number | null;
  saturatedFatG?: number | null;
  fiberG?: number | null;
  sugarsG?: number | null;
  saltG?: number | null;
};

const num = (v: number | null | undefined): string | null =>
  v !== undefined && v !== null ? String(v) : null;

async function insertNutrition(
  productId: string,
  n: NutritionInput,
  source: string,
  sourceUrl: string | null,
) {
  await db
    .insert(productNutrition)
    .values({
      productId,
      basis: n.basis,
      energyKcal: n.energyKcal ?? null,
      proteinG: num(n.proteinG),
      carbohydrateG: num(n.carbohydrateG),
      fatG: num(n.fatG),
      saturatedFatG: num(n.saturatedFatG),
      fiberG: num(n.fiberG),
      sugarsG: num(n.sugarsG),
      saltG: num(n.saltG),
      source,
      sourceUrl,
    })
    .onConflictDoUpdate({
      target: productNutrition.productId,
      set: {
        basis: n.basis,
        energyKcal: n.energyKcal ?? null,
        proteinG: num(n.proteinG),
        carbohydrateG: num(n.carbohydrateG),
        fatG: num(n.fatG),
        saturatedFatG: num(n.saturatedFatG),
        fiberG: num(n.fiberG),
        sugarsG: num(n.sugarsG),
        saltG: num(n.saltG),
        source,
        sourceUrl,
        updatedAt: new Date(),
      },
    });
}

/** Import by barcode: local cache first, then Open Food Facts (global row). */
export async function importOffProductAction(barcode: string): Promise<ActionResult<{ id: string; fromOff: boolean }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  if (!/^\d{6,14}$/.test(barcode)) return { ok: false, error: "invalid-barcode" };

  const cached = (
    await db
      .select()
      .from(product)
      .where(and(isNull(product.ownerUserId), eq(product.barcode, barcode)))
      .limit(1)
  )[0];
  if (cached) return { ok: true, data: { id: cached.id, fromOff: false } };

  const off = await fetchOffProductV3(barcode);
  if (!off) return { ok: false, error: "off-not-found" };

  // Try to auto-link a food concept by name similarity (deterministic).
  const concepts = await db.select().from(foodConcept).where(isNull(foodConcept.ownerUserId));
  let bestConcept: string | null = null;
  let bestScore = 0;
  for (const c of concepts) {
    const score = Math.max(similarity(off.name, c.nameFr), similarity(off.name, c.nameEn));
    if (score > bestScore) {
      bestScore = score;
      bestConcept = c.id;
    }
  }

  const inserted = (
    await db
      .insert(product)
      .values({
        ownerUserId: null,
        name: off.name,
        brand: off.brand,
        barcode: off.barcode,
        category: off.category,
        foodConceptId: bestScore >= 0.6 ? bestConcept : null,
        purchasingMode: off.purchasingMode,
        packageQuantity: off.packageQuantity !== null ? String(off.packageQuantity) : null,
        packageUnit: off.packageUnit,
        halalState: off.halalClaimed ? "CLAIMED" : "UNKNOWN",
        organic: off.organic,
        ingredients: off.ingredients,
        allergens: off.allergens,
        source: "off",
        externalIds: { off: off.offId },
      })
      .returning()
  )[0]!;

  if (off.nutrition) {
    await insertNutrition(inserted.id, off.nutrition, "off", `https://world.openfoodfacts.org/product/${off.offId}`);
  }

  revalidatePath("/products");
  return { ok: true, data: { id: inserted.id, fromOff: true } };
}

const priceSchema = z.object({
  productId: z.uuid(),
  storeId: z.uuid(),
  amountCents: z.number().int().positive().max(1_000_000),
  priceBasis: z.enum(["unit", "per_kg", "per_100g", "per_l", "per_100ml"]).default("unit"),
  discounted: z.boolean().default(false),
  regularAmountCents: z.number().int().positive().max(1_000_000).optional(),
  notes: z.string().max(300).optional(),
});

export async function addPriceObservationAction(input: unknown): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const d = parsed.data;

  await db.insert(priceObservation).values({
    productId: d.productId,
    storeId: d.storeId,
    amountCents: d.amountCents,
    priceBasis: d.priceBasis,
    source: "user",
    discounted: d.discounted,
    regularAmountCents: d.regularAmountCents ?? null,
    notes: d.notes ?? null,
    createdByUserId: session.userId,
    observedAt: new Date(),
  });

  revalidatePath(`/products/${d.productId}`);
  return { ok: true };
}

export async function setProductConceptAction(productId: string, conceptId: string | null): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  await db
    .update(product)
    .set({ foodConceptId: conceptId, updatedAt: new Date() })
    .where(
      and(
        eq(product.id, productId),
        or(eq(product.ownerUserId, session.userId), isNull(product.ownerUserId)),
      ),
    );
  revalidatePath(`/products/${productId}`);
  return { ok: true };
}

export async function setHalalStateAction(
  productId: string,
  halalState: "CONFIRMED" | "CLAIMED" | "UNKNOWN" | "NOT_HALAL",
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  await db
    .update(product)
    .set({ halalState, updatedAt: new Date() })
    .where(
      and(
        eq(product.id, productId),
        or(eq(product.ownerUserId, session.userId), isNull(product.ownerUserId)),
      ),
    );
  revalidatePath(`/products/${productId}`);
  return { ok: true };
}
