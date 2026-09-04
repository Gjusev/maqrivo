/**
 * Versioned JSON contract between the Node app and the Python CP-SAT worker.
 * v1. All money = integer cents; all quantities = integer base units
 * (g / ml / unit). The solver is a pure function of this document.
 */
import { z } from "zod";

// ── Shared shapes ──────────────────────────────────────────────────────────

export const promotionMechanismSchema = z.enum([
  "PROMO_PRICE",
  "PERCENTAGE_OFF",
  "MULTIBUY",
  "BUY_X_GET_Y",
  "SECOND_UNIT_DISCOUNT",
  "LOYALTY_PRICE",
  "CATEGORY_PROMO",
]);
export type PromotionMechanism = z.infer<typeof promotionMechanismSchema>;

const promotionSchema = z.object({
  mechanism: promotionMechanismSchema,
  /** PROMO_PRICE / LOYALTY_PRICE: price per unit in cents. */
  promoPriceCents: z.number().int().positive().optional(),
  /** PERCENTAGE_OFF / SECOND_UNIT_DISCOUNT / CATEGORY_PROMO. */
  discountPct: z.number().int().min(1).max(100).optional(),
  /** MULTIBUY: bundleQty units at bundlePriceCents. */
  bundleQty: z.number().int().positive().optional(),
  bundlePriceCents: z.number().int().positive().optional(),
  /** BUY_X_GET_Y: buyQty paid, freeQty free per group. */
  buyQty: z.number().int().positive().optional(),
  freeQty: z.number().int().positive().optional(),
});
export type SolverPromotion = z.infer<typeof promotionSchema>;

const candidateSchema = z.object({
  id: z.string(),
  productId: z.string(),
  storeId: z.string(),
  conceptId: z.string(),
  purchasingMode: z.enum(["PACKAGED", "WEIGHT", "UNIT"]),
  /** Total content of one purchase unit in base units (g/ml/unit). 0 = weight with free amount. */
  packContentBase: z.number().int().nonnegative(),
  /** Shelf price of one purchase unit in cents (unit basis) — promotions re-evaluate per count. */
  unitPriceCents: z.number().int().nonnegative(),
  /** For WEIGHT candidates: cents per kg (unitPriceCents ignored). */
  pricePerKgCents: z.number().int().nonnegative().optional(),
  maxCount: z.number().int().positive(),
  promotions: z.array(promotionSchema).default([]),
  shelfLifeClass: z.enum(["storable", "semi", "fresh"]),
  stale: z.boolean().default(false),
  favorite: z.boolean().default(false),
  /** Grams of protein per 100 base units, for MAX_PROTEIN_PER_EURO. */
  proteinPer100: z.number().nonnegative().optional(),
});
export type SolverCandidate = z.infer<typeof candidateSchema>;

// ── optimize_basket ────────────────────────────────────────────────────────

export const basketProblemSchema = z.object({
  requirements: z.array(
    z.object({
      conceptId: z.string(),
      requiredBase: z.number().int().nonnegative(),
    }),
  ),
  candidates: z.array(candidateSchema),
  stores: z.array(
    z.object({
      id: z.string(),
      distanceM: z.number().int().nonnegative(),
      favorite: z.boolean().default(false),
    }),
  ),
  options: z.object({
    objective: z
      .enum([
        "CHEAPEST",
        "BALANCED",
        "FEWEST_STORES",
        "MINIMUM_TRAVEL",
        "MAX_PROTEIN_PER_EURO",
        "PROMOTION_FOCUSED",
        "LOW_WASTE",
      ])
      .default("BALANCED"),
    maxStores: z.number().int().positive().default(3),
    /** Flat penalty in cents per additional store beyond the first. */
    travelPenaltyCentsPerStore: z.number().int().nonnegative().default(250),
    /** Extra penalty per metre per store (MINIMUM_TRAVEL multiplies). */
    travelPenaltyCentsPerKm: z.number().int().nonnegative().default(0),
    /** Uncertainty margin applied to stale prices (percent). */
    staleMarginPct: z.number().int().min(0).max(100).default(15),
    /** Soft budget: penalty in cents per euro of overrun. */
    budgetCents: z.number().int().positive().nullable().default(null),
    budgetPenaltyCentsPerEuro: z.number().int().positive().default(150),
    /** Residual credit rates by shelf-life class (0..1, basis points: 8000 = 80%). */
    residualRates: z
      .object({
        storable: z.number().min(0).max(1).default(0.8),
        semi: z.number().min(0).default(0.5),
        fresh: z.number().min(0).default(0.2),
      })
      .default({ storable: 0.8, semi: 0.5, fresh: 0.2 }),
    /** Penalty per kg of perishable (fresh) surplus, cents. */
    wastePenaltyCentsPerKg: z.number().int().nonnegative().default(50),
    favoriteStoreBonusCents: z.number().int().nonnegative().default(30),
  }),
  lockedItems: z
    .array(z.object({ productId: z.string(), storeId: z.string(), count: z.number().int().positive() }))
    .default([]),
});
export type BasketProblem = z.infer<typeof basketProblemSchema>;

export const basketSolutionSchema = z.object({
  status: z.enum(["OPTIMAL", "FEASIBLE", "INFEASIBLE", "ERROR"]),
  items: z
    .array(
      z.object({
        candidateId: z.string(),
        productId: z.string(),
        storeId: z.string(),
        conceptId: z.string(),
        count: z.number().int().nonnegative(),
        contentBase: z.number().int(),
        paidCents: z.number().int(),
        effectiveCents: z.number().int(),
        appliedPromotion: promotionSchema.optional(),
        reason: z.string().optional(),
      }),
    )
    .default([]),
  visitedStores: z.array(z.string()).default([]),
  totalPaidCents: z.number().int(),
  totalEffectiveCents: z.number().int(),
  budgetOverrunCents: z.number().int().default(0),
  surplusByConcept: z.record(z.string(), z.number().int()).default({}),
  /** Deterministic reason codes with parameters (phrased for display, never invented). */
  reasons: z
    .array(
      z.object({
        code: z.string(),
        params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      }),
    )
    .default([]),
  infeasibleRequirements: z.array(z.string()).default([]),
  message: z.string().optional(),
});
export type BasketSolution = z.infer<typeof basketSolutionSchema>;

// ── plan_meals ─────────────────────────────────────────────────────────────

export const mealPlanProblemSchema = z.object({
  slots: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
      lockedRecipeId: z.string().nullable().default(null),
    }),
  ),
  recipes: z.array(
    z.object({
      id: z.string(),
      mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner", "snack"])),
      /** Nutrition per serving ×10 (int): 520 = 52.0 g. */
      kcalX10: z.number().int().nonnegative(),
      proteinGX10: z.number().int().nonnegative(),
      carbsGX10: z.number().int().nonnegative(),
      fatGX10: z.number().int().nonnegative(),
      totalMinutes: z.number().int().nonnegative().default(30),
      favorite: z.boolean().default(false),
    }),
  ),
  options: z.object({
    /** Targets per day ×10. */
    dailyKcalX10: z.number().int().positive(),
    dailyProteinGX10: z.number().int().positive(),
    /** Penalty weights (cents-equivalent units). */
    kcalDeviationWeight: z.number().int().positive().default(1),
    proteinShortfallWeight: z.number().int().positive().default(4),
    repetitionWeight: z.number().int().positive().default(30),
    favoriteBonus: z.number().int().positive().default(10),
    maxCookingMinutes: z.number().int().positive().default(60),
    /** Min distinct days between repeats of the same recipe (0 = free). */
    repetitionGapDays: z.number().int().min(0).default(2),
  }),
});
export type MealPlanProblem = z.infer<typeof mealPlanProblemSchema>;

export const mealPlanSolutionSchema = z.object({
  status: z.enum(["OPTIMAL", "FEASIBLE", "INFEASIBLE", "ERROR"]),
  assignments: z
    .array(
      z.object({
        slotId: z.string(),
        recipeId: z.string().nullable(),
        locked: z.boolean().default(false),
      }),
    )
    .default([]),
  totals: z
    .object({
      kcalX10PerDay: z.array(z.number().int()).default([]),
      proteinGX10PerDay: z.array(z.number().int()).default([]),
    })
    .default({ kcalX10PerDay: [], proteinGX10PerDay: [] }),
  message: z.string().optional(),
});
export type MealPlanSolution = z.infer<typeof mealPlanSolutionSchema>;

// ── Envelope ───────────────────────────────────────────────────────────────

export const solveRequestSchema = z.discriminatedUnion("mode", [
  z.object({ version: z.literal(1), mode: z.literal("optimize_basket"), problem: basketProblemSchema }),
  z.object({ version: z.literal(1), mode: z.literal("plan_meals"), problem: mealPlanProblemSchema }),
]);
export type SolveRequest = z.infer<typeof solveRequestSchema>;

export const solveResponseSchema = z.discriminatedUnion("mode", [
  z.object({ version: z.number(), mode: z.literal("optimize_basket"), solution: basketSolutionSchema }),
  z.object({ version: z.number(), mode: z.literal("plan_meals"), solution: mealPlanSolutionSchema }),
]);
export type SolveResponse = z.infer<typeof solveResponseSchema>;
