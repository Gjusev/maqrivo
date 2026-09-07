/**
 * The pantry write-side loop (plan 012). The planner already NETS pantry
 * stock on read; this module keeps the pantry truthful on write:
 * - `restockFromPurchase`: a shopping item marked purchased lands in the pantry.
 * - `runPantryConsumptionSweep`: past slots of ACTIVE meal plans deduct the
 *   ingredients they were believed to cook, so the next plan doesn't double-buy.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { ingestionRun, mealPlan, mealSlot, pantryItem, recipe, recipeIngredient } from "@maqrivo/db";
import { round3, slotConceptQuantities, toBaseUnits } from "./quantities";

// ── Restock ─────────────────────────────────────────────────────────────────

/**
 * Idempotent-ish upsert: add the purchased quantity to an existing active
 * pantry row for the same product (concept fallback when no product), else
 * insert a new one. Mirrors addPantryItemAction's insert shape and
 * adjustPantryQuantityAction's increment/rounding. No-op when the item has
 * neither a product nor a concept link, or the quantity is not positive.
 */
export async function restockFromPurchase(input: {
  userId: string;
  productId: string | null;
  conceptId: string | null;
  quantity: number; // in the shopping item's unit
  unit: string;
}): Promise<void> {
  const match =
    input.productId !== null
      ? and(
          eq(pantryItem.userId, input.userId),
          eq(pantryItem.productId, input.productId),
          eq(pantryItem.status, "active"),
        )
      : input.conceptId !== null
        ? and(
            eq(pantryItem.userId, input.userId),
            eq(pantryItem.foodConceptId, input.conceptId),
            eq(pantryItem.status, "active"),
          )
        : null;
  if (!match) return;
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return;

  const existing = (
    await db
      .select()
      .from(pantryItem)
      .where(match)
      .orderBy(pantryItem.createdAt)
      .limit(1)
  )[0];

  if (existing) {
    // Convert through base units so a g purchase lands on a kg row correctly.
    const delta = toBaseUnits(input.quantity, input.unit) / toBaseUnits(1, existing.unit);
    const next = Math.max(0, Number(existing.quantity) + delta);
    await db
      .update(pantryItem)
      .set({ quantity: String(round3(next)), updatedAt: new Date() })
      .where(eq(pantryItem.id, existing.id));
    return;
  }

  await db.insert(pantryItem).values({
    userId: input.userId,
    foodConceptId: input.conceptId,
    productId: input.productId,
    label: null,
    quantity: String(round3(input.quantity)),
    unit: input.unit,
    expiresOn: null,
  });
}

// ── Consumption sweep ───────────────────────────────────────────────────────

const LOOKBACK_DAYS = 7;

/**
 * Deduct pantry stock for past, unswept slots of ACTIVE meal plans. Dedupe:
 * mealSlot carries no processed flag, so the sweep only ever touches slotDates
 * in the last 7 days and records the swept range as stats {from,to} (day
 * numbers) on an ingestionRun of kind pantry_consumption; ranges already
 * recorded are skipped. Pantry rows are only decremented, never invented:
 * concepts with no matching active row are counted as missing and skipped.
 */
export async function runPantryConsumptionSweep(): Promise<{ slots: number; deducted: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const windowDates: string[] = [];
  for (let i = LOOKBACK_DAYS; i >= 1; i--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    windowDates.push(d.toISOString().slice(0, 10));
  }

  const priorRuns = await db
    .select({ stats: ingestionRun.stats })
    .from(ingestionRun)
    .where(and(eq(ingestionRun.kind, "pantry_consumption"), inArray(ingestionRun.status, ["succeeded", "partial"])));
  const covered = new Set<string>();
  for (const run of priorRuns) {
    const from = run.stats?.from;
    const to = run.stats?.to;
    if (typeof from !== "number" || typeof to !== "number" || from > to) continue;
    for (let n = from; n <= to; n++) {
      const s = String(n);
      covered.add(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
    }
  }
  const pending = windowDates.filter((d) => !covered.has(d));
  if (pending.length === 0) return { slots: 0, deducted: 0 };

  const run = (
    await db
      .insert(ingestionRun)
      .values({ source: "pantry", kind: "pantry_consumption", status: "running", stats: {}, warnings: [] })
      .returning()
  )[0]!;

  const warnings: string[] = [];
  let slots = 0;
  let deducted = 0;
  let missing = 0;
  try {
    const slotRows = await db
      .select({ slot: mealSlot, recipeServings: recipe.servings, userId: mealPlan.userId })
      .from(mealSlot)
      .innerJoin(mealPlan, eq(mealSlot.mealPlanId, mealPlan.id))
      .innerJoin(recipe, eq(mealSlot.recipeId, recipe.id))
      .where(and(eq(mealPlan.status, "active"), inArray(mealSlot.slotDate, pending)));

    for (const { slot, recipeServings, userId } of slotRows) {
      try {
        const ings = await db
          .select()
          .from(recipeIngredient)
          .where(eq(recipeIngredient.recipeId, slot.recipeId!));
        const perConcept = slotConceptQuantities(
          ings.map((ing) => ({ foodConceptId: ing.foodConceptId, quantity: Number(ing.quantity), unit: ing.unit })),
          recipeServings,
          slot.servings,
        );
        for (const [conceptId, needBase] of perConcept) {
          const rows = await db
            .select()
            .from(pantryItem)
            .where(and(eq(pantryItem.userId, userId), eq(pantryItem.foodConceptId, conceptId), eq(pantryItem.status, "active")));
          if (rows.length === 0) {
            missing++;
            continue;
          }
          // Product-linked rows first (specific purchases), oldest first.
          rows.sort(
            (a, b) =>
              (a.productId !== null ? 0 : 1) - (b.productId !== null ? 0 : 1) ||
              a.createdAt.getTime() - b.createdAt.getTime(),
          );
          let remaining = needBase;
          for (const row of rows) {
            if (remaining <= 0) break;
            const factor = toBaseUnits(1, row.unit);
            const haveBase = Number(row.quantity) * factor;
            const take = Math.min(haveBase, remaining);
            const nextRowUnit = round3(Math.max(0, haveBase - take) / factor);
            await db
              .update(pantryItem)
              .set({
                quantity: String(nextRowUnit),
                status: nextRowUnit === 0 ? "used_up" : row.status,
                updatedAt: new Date(),
              })
              .where(eq(pantryItem.id, row.id));
            remaining = round3(remaining - take);
            if (take > 0) deducted++;
          }
        }
        slots++;
      } catch (err) {
        warnings.push(`slot ${slot.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await db
      .update(ingestionRun)
      .set({
        status: warnings.length > 0 ? "partial" : "succeeded",
        finishedAt: new Date(),
        stats: {
          from: Number(pending[0]!.replaceAll("-", "")),
          to: Number(pending[pending.length - 1]!.replaceAll("-", "")),
          slots,
          deducted,
          missing,
        },
        warnings,
      })
      .where(eq(ingestionRun.id, run.id));
    return { slots, deducted };
  } catch (err) {
    await db
      .update(ingestionRun)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(ingestionRun.id, run.id));
    throw err;
  }
}
