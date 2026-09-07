/**
 * Optimization orchestration: assemble solver problems from domain data,
 * run the CP-SAT worker, persist meal plans and shopping plans with their
 * deterministic reason snapshots. AI is never in this path.
 */
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  foodConcept,
  retailer,
  mealPlan,
  mealSlot,
  nutritionProfile,
  pantryItem,
  priceObservation,
  product,
  productNutrition,
  promotion,
  promotionProductMatch,
  recipe,
  recipeIngredient,
  shoppingItem,
  shoppingPlan,
  shoppingPlanStore,
  store,
  userPreferences,
  userStorePrefs,
} from "@maqrivo/db";
import { getSessionContext, loadUserContext } from "../session";
import {
  freshnessOf,
  netRequirements,
  orderStoresByProximity,
  totalNutrition,
  type IngredientNutrition,
  type NutritionPer100,
} from "@maqrivo/core";
import type { BasketProblem, BasketSolution, MealPlanProblem } from "@maqrivo/solver-contract";
import { optimizeBasket, planMeals } from "../solver/client";

const TRAVEL_PENALTY_BY_SENSITIVITY: Record<string, number> = { low: 100, medium: 250, high: 500 };

export interface PlanWeekResult {
  ok: boolean;
  error?: string;
  mealPlanId?: string;
  shoppingPlanId?: string;
  status?: string;
  message?: string;
  infeasible?: string[];
}

function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0 Sunday
  const shift = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + shift);
  return d;
}

/** Full weekly pipeline: plan meals → optimize basket → persist both. */
export async function runWeeklyPlan(userId: string, objective?: string): Promise<PlanWeekResult> {
  const session = await getSessionContext();
  if (!session || session.userId !== userId) return { ok: false, error: "unauthorized" };
  return runWeeklyPlanForUser(userId, objective);
}

/**
 * Session-free pipeline core (seed scripts, tests): same behavior without an
 * HTTP request context. Callers must have already established the identity.
 */
export async function runWeeklyPlanForUser(userId: string, objective?: string): Promise<PlanWeekResult> {
  const profile = (await db.select().from(nutritionProfile).where(eq(nutritionProfile.userId, userId)).orderBy(desc(nutritionProfile.createdAt)).limit(1))[0];
  const prefs = (await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1))[0];
  if (!profile) return { ok: false, error: "no-profile" };

  const weekStart = mondayOf(new Date()).toISOString().slice(0, 10);
  const chosenObjective = (objective ?? prefs?.defaultObjective ?? "BALANCED") as Objective;

  // ── Phase 1: plan meals ────────────────────────────────────────────────
  const mealResult = await planWeekMeals(userId, weekStart, profile, prefs);
  if (!mealResult.ok) return mealResult;

  // ── Phase 2: optimize basket from the plan's requirements ─────────────
  const basketResult = await optimizeShoppingForUser(userId, weekStart, chosenObjective);
  return basketResult;
}

async function planWeekMeals(
  userId: string,
  weekStart: string,
  profile: typeof nutritionProfile.$inferSelect,
  prefs: typeof userPreferences.$inferSelect | undefined,
): Promise<PlanWeekResult> {
  // Slots: meals per day pattern (3 → breakfast/lunch/dinner, 2 → lunch/dinner).
  const mealTypes = profile.mealsPerDay >= 3 ? (["breakfast", "lunch", "dinner"] as const) : (["lunch", "dinner"] as const);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${weekStart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Existing plan for the week (locks) or a fresh one.
  let plan = (
    await db
      .select()
      .from(mealPlan)
      .where(and(eq(mealPlan.userId, userId), eq(mealPlan.weekStart, weekStart), eq(mealPlan.status, "active")))
      .limit(1)
  )[0];
  if (!plan) {
    plan = (await db.insert(mealPlan).values({ userId, weekStart, status: "active" }).returning())[0]!;
  }
  const existingSlots = await db.select().from(mealSlot).where(eq(mealSlot.mealPlanId, plan.id));
  const lockedBySlot = new Map(existingSlots.filter((s) => s.locked && s.recipeId).map((s) => [`${s.slotDate}:${s.mealType}`, s.recipeId]));

  // Candidate recipes: user's own + seeds, with deterministic nutrition.
  const recipes = await db
    .select()
    .from(recipe)
    .where(or(eq(recipe.ownerUserId, userId), isNull(recipe.ownerUserId)));
  const recipeData: {
    id: string;
    row: typeof recipe.$inferSelect;
    nutrition: { kcal: number; protein: number; carbs: number; fat: number };
  }[] = [];
  for (const r of recipes) {
    const ings = await db
      .select({ ing: recipeIngredient, concept: foodConcept })
      .from(recipeIngredient)
      .innerJoin(foodConcept, eq(recipeIngredient.foodConceptId, foodConcept.id))
      .where(eq(recipeIngredient.recipeId, r.id));
    const inputs: IngredientNutrition[] = ings.map(({ ing, concept }) => ({
      quantity: { amount: Number(ing.quantity), unit: ing.unit as "g" },
      nutrition: conceptNutrition(concept),
    }));
    const totals = totalNutrition(inputs);
    if (totals.energyKcal == null || totals.proteinG == null) continue; // unknowable recipes can't be planned
    recipeData.push({
      id: r.id,
      row: r,
      nutrition: {
        kcal: totals.energyKcal,
        protein: totals.proteinG,
        carbs: totals.carbohydrateG ?? 0,
        fat: totals.fatG ?? 0,
      },
    });
  }
  if (recipeData.length === 0) return { ok: false, error: "no-recipes" };

  const problem: MealPlanProblem = {
    slots: dates.flatMap((date) =>
      mealTypes.map((mealType) => ({
        id: `${date}:${mealType}`,
        date,
        mealType,
        lockedRecipeId: lockedBySlot.get(`${date}:${mealType}`) ?? null,
      })),
    ),
    recipes: recipeData.map((r) => ({
      id: r.id,
      mealTypes: r.row.mealTypes as ("breakfast" | "lunch" | "dinner" | "snack")[],
      kcalX10: Math.round((r.nutrition.kcal / r.row.servings) * 10),
      proteinGX10: Math.round((r.nutrition.protein / r.row.servings) * 10),
      carbsGX10: Math.round((r.nutrition.carbs / r.row.servings) * 10),
      fatGX10: Math.round((r.nutrition.fat / r.row.servings) * 10),
      totalMinutes: (r.row.prepMinutes ?? 0) + (r.row.cookMinutes ?? 0),
      favorite: false,
    })),
    options: {
      dailyKcalX10: (profile.dailyKcal ?? 2200) * 10,
      dailyProteinGX10: (profile.proteinG ?? 120) * 10,
      kcalDeviationWeight: 1,
      proteinShortfallWeight: 4,
      repetitionWeight: 30,
      favoriteBonus: 10,
      maxCookingMinutes: prefs?.maxCookingMinutes ?? 60,
      repetitionGapDays: prefs?.repetitionTolerance ?? 2,
    },
  };

  const solution = await planMeals(problem);

  // Persist slots (locks preserved by re-writing their locked recipes).
  await db.delete(mealSlot).where(eq(mealSlot.mealPlanId, plan.id));
  for (const assignment of solution.assignments) {
    const [date, mealType] = assignment.slotId.split(":");
    if (!date || !mealType) continue;
    const locked = lockedBySlot.has(assignment.slotId);
    await db.insert(mealSlot).values({
      mealPlanId: plan.id,
      slotDate: date,
      mealType: mealType as "breakfast" | "lunch" | "dinner" | "snack",
      recipeId: locked ? (lockedBySlot.get(assignment.slotId) ?? null) : assignment.recipeId,
      servings: 1,
      locked,
    });
  }

  if (solution.status === "INFEASIBLE") return { ok: false, error: "plan-infeasible" };
  return { ok: true, mealPlanId: plan.id };
}

type Objective = "CHEAPEST" | "BALANCED" | "FEWEST_STORES" | "MINIMUM_TRAVEL" | "MAX_PROTEIN_PER_EURO" | "PROMOTION_FOCUSED" | "LOW_WASTE";

export async function optimizeShopping(userId: string, weekStart: string, objectiveIn: string): Promise<PlanWeekResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  return optimizeShoppingForUser(userId, weekStart, objectiveIn);
}

/** Session-free core: home coordinates come from the stored profile. */
export async function optimizeShoppingForUser(
  userId: string,
  weekStart: string,
  objectiveIn: string,
): Promise<PlanWeekResult> {
  const objective = objectiveIn as Objective;
  const context = await loadUserContext(userId);
  if (!context) return { ok: false, error: "unauthorized" };

  const profile = (await db.select().from(nutritionProfile).where(eq(nutritionProfile.userId, userId)).orderBy(desc(nutritionProfile.createdAt)).limit(1))[0];
  const prefs = (await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1))[0];
  if (!profile) return { ok: false, error: "no-profile" };

  const plan = (
    await db
      .select()
      .from(mealPlan)
      .where(and(eq(mealPlan.userId, userId), eq(mealPlan.weekStart, weekStart), eq(mealPlan.status, "active")))
      .limit(1)
  )[0];
  if (!plan) return { ok: false, error: "no-meal-plan" };

  // Requirements: recipe ingredients across the week, minus consumable pantry.
  const slots = await db.select().from(mealSlot).where(eq(mealSlot.mealPlanId, plan.id));
  const needPerConcept = new Map<string, number>();
  for (const slot of slots) {
    if (!slot.recipeId) continue;
    const ings = await db
      .select()
      .from(recipeIngredient)
      .where(eq(recipeIngredient.recipeId, slot.recipeId));
    const recipeRow = (await db.select().from(recipe).where(eq(recipe.id, slot.recipeId)).limit(1))[0];
    const scale = recipeRow ? slot.servings / recipeRow.servings : 1;
    for (const ing of ings) {
      const base = toBaseUnits(Number(ing.quantity), ing.unit as "g");
      needPerConcept.set(ing.foodConceptId, (needPerConcept.get(ing.foodConceptId) ?? 0) + base * scale);
    }
  }
  const pantry = await db
    .select({ item: pantryItem, concept: foodConcept })
    .from(pantryItem)
    .leftJoin(foodConcept, eq(pantryItem.foodConceptId, foodConcept.id))
    .where(eq(pantryItem.userId, userId));
  const pantryStock = pantry
    .filter((p) => p.item.status === "active" && p.item.foodConceptId !== null)
    .map((p) => ({
      conceptId: p.item.foodConceptId!,
      quantityBase: toBaseUnits(Number(p.item.quantity), p.item.unit as "g"),
      expiresOn: p.item.expiresOn,
      shelfLifeClass: (p.concept?.shelfLifeClass ?? "semi") as "storable" | "semi" | "fresh",
    }));
  const conceptShelf = new Map(pantry.map((p) => [p.item.foodConceptId, (p.concept?.shelfLifeClass ?? "semi") as "storable" | "semi" | "fresh"]));
  const net = netRequirements(
    [...needPerConcept.entries()].map(([conceptId, quantityBase]) => ({
      conceptId,
      quantityBase: Math.ceil(quantityBase),
      shelfLifeClass: conceptShelf.get(conceptId) ?? "semi",
    })),
    pantryStock,
    weekStart,
  );
  const requirements = net.filter((r) => r.quantityBase > 0);
  if (requirements.length === 0) {
    // Pantry covers everything: record an empty active shopping plan.
    const existing = await db.select().from(shoppingPlan).where(and(eq(shoppingPlan.userId, userId), eq(shoppingPlan.status, "active"))).limit(1);
    if (existing[0]) return { ok: true, shoppingPlanId: existing[0].id, status: "COVERED_BY_PANTRY" };
    const created = (await db.insert(shoppingPlan).values({ userId, mealPlanId: plan.id, objective, totalCents: 0, summary: { coveredByPantry: true } }).returning())[0]!;
    return { ok: true, shoppingPlanId: created.id, status: "COVERED_BY_PANTRY" };
  }

  // Enabled stores (not avoided) with distances.
  const enabledStores = await db
    .select({ store: store, prefs: userStorePrefs })
    .from(userStorePrefs)
    .innerJoin(store, eq(userStorePrefs.storeId, store.id))
    .where(and(eq(userStorePrefs.userId, userId), eq(userStorePrefs.enabled, true)));
  const usable = enabledStores.filter((s) => !s.prefs.avoided);
  if (usable.length === 0) return { ok: false, error: "no-enabled-stores" };

  // Candidate products: linked to required concepts, halal-compliant, priced.
  const conceptIds = requirements.map((r) => r.conceptId);
  const products = await db
    .select({ product: product, nutrition: productNutrition, concept: foodConcept })
    .from(product)
    .leftJoin(productNutrition, eq(productNutrition.productId, product.id))
    .leftJoin(foodConcept, eq(product.foodConceptId, foodConcept.id));
  const HALAL_SENSITIVE = new Set(["poultry", "beef", "lamb", "pork", "fish"]); // halal strictness concerns meat; dairy/eggs pass
  const halalGate = (p: typeof product.$inferSelect, conceptRow: typeof foodConcept.$inferSelect | null) => {
    if (!profile.halalRequired) return true;
    if (!conceptRow || !HALAL_SENSITIVE.has(conceptRow.category)) return true; // plant foods: state irrelevant
    if (p.halalState === "CONFIRMED") return true;
    if (p.halalState === "CLAIMED" && profile.allowUnknownHalal) return true; // explicit user permission only
    return false; // UNKNOWN or CLAIMED-without-permission never silently passes
  };
  const candidatesByConcept = new Map<string, { product: typeof product.$inferSelect; nutrition: typeof productNutrition.$inferSelect | null }[]>();
  for (const row of products) {
    if (!row.product.foodConceptId || !conceptIds.includes(row.product.foodConceptId)) continue;
    if (!halalGate(row.product, row.concept)) continue;
    const list = candidatesByConcept.get(row.product.foodConceptId) ?? [];
    list.push({ product: row.product, nutrition: row.nutrition });
    candidatesByConcept.set(row.product.foodConceptId, list);
  }

  const retailers = await db.select().from(retailer);
  const retailerSlugById = new Map(retailers.map((r) => [r.id, r.slug]));

  // Shelf-life per concept for the solver's residual/waste logic.
  const allConcepts = await db.select().from(foodConcept);
  const shelfByConcept = new Map(allConcepts.map((c) => [c.id, c.shelfLifeClass as "storable" | "semi" | "fresh"]));

  // Fresh price observations per (product, store): the latest row per pair is
  // picked in SQL via Postgres' keep-first dedup (index:
  // price_obs_product_store_idx) instead of loading every observation into
  // memory. Raw SQL rows are snake_case — mapped explicitly to the fields
  // used downstream (freshness + pricing).
  const now = new Date();
  const latestPrices = (
    await db.execute<{
      product_id: string;
      store_id: string;
      amount_cents: number;
      price_basis: typeof priceObservation.$inferSelect.priceBasis;
      observed_at: Date;
      source: typeof priceObservation.$inferSelect.source;
    }>(sql`
      SELECT DISTINCT ON (product_id, store_id)
        product_id, store_id, amount_cents, price_basis, observed_at, source
      FROM price_observation
      ORDER BY product_id, store_id, observed_at DESC
    `)
  ).rows;
  const priceByProductStore = new Map<
    string,
    Pick<typeof priceObservation.$inferSelect, "amountCents" | "priceBasis" | "observedAt" | "source">
  >();
  for (const row of latestPrices) {
    priceByProductStore.set(`${row.product_id}:${row.store_id}`, {
      amountCents: row.amount_cents,
      priceBasis: row.price_basis,
      observedAt: row.observed_at,
      source: row.source,
    });
  }

  // Active promotions matched to products at those stores.
  const matches = await db
    .select({ match: promotionProductMatch, promo: promotion })
    .from(promotionProductMatch)
    .innerJoin(promotion, eq(promotionProductMatch.promotionId, promotion.id));
  const today = now.toISOString().slice(0, 10);
  const promoByProductStore = new Map<string, typeof promotion.$inferSelect>();
  for (const { match, promo } of matches) {
    if (match.state !== "EXACT" && match.state !== "PROBABLE") continue;
    if (promo.verification === "EXPIRED") continue;
    if (promo.validUntil && promo.validUntil < today) continue;
    if (!match.productId) continue;
    const key = promo.storeId ? `${match.productId}:${promo.storeId}` : `*:${match.productId}`;
    promoByProductStore.set(key, promo);
  }

  const candidates: BasketProblem["candidates"] = [];
  for (const [conceptId, list] of candidatesByConcept) {
    for (const { product: p, nutrition } of list) {
      for (const storeRow of usable) {
        const obs = priceByProductStore.get(`${p.id}:${storeRow.store.id}`);
        if (!obs) continue;
        const fresh = freshnessOf(obs.observedAt, obs.source, now);

        let promoApplied: typeof promotion.$inferSelect | undefined =
          promoByProductStore.get(`${p.id}:${storeRow.store.id}`) ??
          promoByProductStore.get(`*:${p.id}`);
        const promotions: BasketProblem["candidates"][number]["promotions"] = [];
        if (promoApplied?.loyaltyRequired) {
          const promoRetailerSlug = retailerSlugById.get(promoApplied.retailerId);
          if (!promoRetailerSlug || !(prefs?.loyaltyRetailers ?? []).includes(promoRetailerSlug)) {
            promoApplied = undefined; // no card, no loyalty price — never faked
          }
        }
        if (promoApplied) {
          promotions.push({
            mechanism: promoApplied.mechanism as never,
            promoPriceCents: promoApplied.promoPriceCents ?? undefined,
            discountPct: promoApplied.discountPct ?? undefined,
            bundleQty: promoApplied.minQty ?? undefined,
            bundlePriceCents: promoApplied.promoPriceCents ?? undefined,
            buyQty: promoApplied.minQty ?? undefined,
            freeQty: promoApplied.getQty ?? undefined,
          });
        }

        if (p.purchasingMode === "WEIGHT" && obs.priceBasis === "per_kg") {
          candidates.push({
            id: `${p.id}:${storeRow.store.id}`,
            productId: p.id,
            storeId: storeRow.store.id,
            conceptId,
            purchasingMode: "WEIGHT",
            packContentBase: 100,
            unitPriceCents: Math.round(obs.amountCents / 10),
            pricePerKgCents: obs.amountCents,
            maxCount: Math.ceil((requirements.find((r) => r.conceptId === conceptId)?.quantityBase ?? 1000) / 100) + 5,
            promotions,
            shelfLifeClass: "fresh",
            stale: fresh.state === "stale",
            favorite: storeRow.prefs.favorite,
            proteinPer100: nutrition?.proteinG != null ? Number(nutrition.proteinG) : undefined,
          });
        } else if (p.packageQuantity != null && p.packageUnit === "g") {
          candidates.push({
            id: `${p.id}:${storeRow.store.id}`,
            productId: p.id,
            storeId: storeRow.store.id,
            conceptId,
            purchasingMode: "PACKAGED",
            packContentBase: Number(p.packageQuantity),
            unitPriceCents: obs.priceBasis === "unit" ? obs.amountCents : Math.round((obs.amountCents * Number(p.packageQuantity)) / 1000),
            maxCount: 8,
            promotions,
            shelfLifeClass: shelfByConcept.get(conceptId) ?? "semi",
            stale: fresh.state === "stale",
            favorite: storeRow.prefs.favorite,
            proteinPer100: nutrition?.proteinG != null ? Number(nutrition.proteinG) : undefined,
          });
        }
      }
    }
  }

  // Requirements without any purchasable candidate are reported, never forced
  // (no evidence, no deal) — the solver covers what evidence supports.
  const coveredConcepts = new Set(candidates.map((c) => c.conceptId));
  const uncovered = requirements.filter((r) => !coveredConcepts.has(r.conceptId));
  const covered = requirements.filter((r) => coveredConcepts.has(r.conceptId));

  const problem: BasketProblem = {
    requirements: covered.map((r) => ({ conceptId: r.conceptId, requiredBase: r.quantityBase })),
    candidates,
    stores: usable.map((s) => ({
      id: s.store.id,
      distanceM: s.prefs.distanceM ?? 0,
      favorite: s.prefs.favorite,
    })),
    options: {
      objective,
      maxStores: prefs?.maxStoresInPlan ?? 3,
      travelPenaltyCentsPerStore: TRAVEL_PENALTY_BY_SENSITIVITY[prefs?.travelSensitivity ?? "medium"] ?? 250,
      travelPenaltyCentsPerKm: 0,
      staleMarginPct: 15,
      budgetCents: profile.weeklyBudgetCents ?? null,
      budgetPenaltyCentsPerEuro: 150,
      residualRates: { storable: 0.8, semi: 0.5, fresh: 0.2 },
      wastePenaltyCentsPerKg: 50,
      favoriteStoreBonusCents: 30,
    },
    lockedItems: [],
  };

  const solution: BasketSolution = covered.length === 0
    ? { status: "INFEASIBLE", items: [], visitedStores: [], totalPaidCents: 0, totalEffectiveCents: 0, budgetOverrunCents: 0, surplusByConcept: {}, reasons: [], infeasibleRequirements: uncovered.map((r) => r.conceptId), message: "no priced products for any requirement" }
    : await optimizeBasket(problem);

  // Persist the shopping plan (snapshot survives price drift).
  await db
    .update(shoppingPlan)
    .set({ status: "archived" })
    .where(and(eq(shoppingPlan.userId, userId), eq(shoppingPlan.status, "active")));
  const created = (
    await db
      .insert(shoppingPlan)
      .values({
        userId,
        mealPlanId: plan.id,
        objective,
        totalCents: solution.totalPaidCents,
        solverStatus: solution.status,
        summary: {
          budgetOverrunCents: solution.budgetOverrunCents,
          surplusByConcept: solution.surplusByConcept,
          reasons: solution.reasons,
          infeasibleRequirements: solution.infeasibleRequirements,
          uncoveredRequirements: uncovered.map((r) => r.conceptId),
          message: solution.message,
        },
      })
      .returning()
  )[0]!;

  // Store sequence: nearest-neighbour from home.
  const visitedRows = usable.filter((s) => solution.visitedStores.includes(s.store.id));
  const ordered = context.homeLat != null && context.homeLng != null
    ? orderStoresByProximity({ lat: context.homeLat, lng: context.homeLng }, visitedRows.map((s) => s.store))
    : visitedRows.map((s) => s.store);
  for (let i = 0; i < ordered.length; i++) {
    await db.insert(shoppingPlanStore).values({
      shoppingPlanId: created.id,
      storeId: ordered[i]!.id,
      sequenceIndex: i,
    });
  }

  // Manual/catalogue additions survive re-optimization: copy them over.
  const priorPlan = (
    await db
      .select()
      .from(shoppingPlan)
      .where(eq(shoppingPlan.userId, userId))
      .orderBy(desc(shoppingPlan.createdAt))
      .limit(5)
  ).find((p) => p.id !== created.id && p.status === "archived");
  if (priorPlan) {
    const manualItems = await db
      .select()
      .from(shoppingItem)
      .where(and(eq(shoppingItem.shoppingPlanId, priorPlan.id), ne(shoppingItem.source, "solver")));
    for (const item of manualItems.filter((i) => i.status !== "skipped")) {
      await db.insert(shoppingItem).values({
        shoppingPlanId: created.id,
        storeId: item.storeId,
        productId: item.productId,
        label: item.label,
        source: item.source,
        requiredQuantity: item.requiredQuantity,
        requiredUnit: item.requiredUnit,
        purchaseQuantity: item.purchaseQuantity,
        packageCount: item.packageCount,
        priceBasis: item.priceBasis,
        unitPriceCents: item.unitPriceCents,
        effectiveCostCents: item.effectiveCostCents,
        appliedPromotionId: item.appliedPromotionId,
        reasons: item.reasons,
        priceFreshness: item.priceFreshness,
        status: item.status,
        sortOrder: 1000 + item.sortOrder,
      });
    }
    if (manualItems.length > 0) {
      await db
        .update(shoppingPlan)
        .set({ totalCents: (created.totalCents ?? 0) + manualItems.filter((i) => i.status !== "skipped").reduce((sum, i) => sum + i.effectiveCostCents, 0) })
        .where(eq(shoppingPlan.id, created.id));
      created.totalCents = (created.totalCents ?? 0) + manualItems.filter((i) => i.status !== "skipped").reduce((sum, i) => sum + i.effectiveCostCents, 0);
    }
  }

  let sortOrder = 0;
  for (const item of solution.items) {
    const obs = priceByProductStore.get(`${item.productId}:${item.storeId}`);
    await db.insert(shoppingItem).values({
      shoppingPlanId: created.id,
      storeId: item.storeId,
      productId: item.productId,
      requiredQuantity: String(Math.round(item.contentBase / 1000)),
      requiredUnit: "kg",
      purchaseQuantity: String(item.count),
      packageCount: item.count,
      priceBasis: obs?.priceBasis ?? "unit",
      unitPriceCents: obs?.amountCents ?? 0,
      effectiveCostCents: item.paidCents,
      appliedPromotionId: null,
      reasons: item.reason ? [{ code: item.reason }] : undefined,
      priceFreshness: obs ? (freshnessOf(obs.observedAt, obs.source, now).state === "fresh" ? "fresh" : "stale") : "unknown",
      sortOrder: sortOrder++,
    });
  }

  return {
    ok: solution.status !== "ERROR" && solution.status !== "INFEASIBLE",
    shoppingPlanId: created.id,
    mealPlanId: plan.id,
    status: solution.status,
    message: solution.message,
    infeasible: solution.infeasibleRequirements,
  };
}

function conceptNutrition(concept: typeof foodConcept.$inferSelect): NutritionPer100 | null {
  const anyValue = concept.energyKcal != null || concept.proteinG != null || concept.fatG != null;
  if (!anyValue) return null;
  return {
    basis: concept.basis === "100ml" ? "100ml" : "100g",
    energyKcal: concept.energyKcal ?? null,
    proteinG: concept.proteinG != null ? Number(concept.proteinG) : null,
    carbohydrateG: concept.carbohydrateG != null ? Number(concept.carbohydrateG) : null,
    fatG: concept.fatG != null ? Number(concept.fatG) : null,
    saturatedFatG: concept.saturatedFatG != null ? Number(concept.saturatedFatG) : null,
    fiberG: concept.fiberG != null ? Number(concept.fiberG) : null,
    sugarsG: concept.sugarsG != null ? Number(concept.sugarsG) : null,
    saltG: concept.saltG != null ? Number(concept.saltG) : null,
  };
}

function toBaseUnits(amount: number, unit: string): number {
  switch (unit) {
    case "kg":
      return amount * 1000;
    case "l":
      return amount * 1000;
    case "g":
    case "ml":
    case "unit":
    case "pack":
      return amount;
    default:
      return amount;
  }
}
