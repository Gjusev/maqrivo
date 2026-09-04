/**
 * Constrained recipe generation. The model may only PROPOSE: it picks
 * concepts from the seeded catalog and suggests quantities. Maqrivo then
 * computes the real macros deterministically and rejects the candidate if
 * it violates the user's constraint. No AI-computed nutrition ever persists.
 */
import { z } from "zod";
import { isNull } from "drizzle-orm";
import { db } from "../db";
import { aiExtraction, foodConcept, recipe, recipeIngredient } from "@maqrivo/db";
import { getSessionContext } from "../session";
import { getAIProvider, AIUnavailableError } from "./provider";
import { totalNutrition, type IngredientNutrition, type NutritionPer100 } from "@maqrivo/core";

const proposalSchema = z.object({
  nameFr: z.string().min(2).max(120),
  nameEn: z.string().min(2).max(120),
  servings: z.coerce.number().int().min(1).max(8),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner", "snack"])).min(1).max(2),
  ingredients: z
    .array(
      z.object({
        conceptSlug: z.string(),
        quantity: z.coerce.number().positive().max(2000),
        unit: z.string().min(1).max(12),
      }),
    )
    .min(2)
    .max(15),
  steps: z.array(z.string().min(3).max(600)).min(2).max(12),
});

export type RecipeProposal = z.infer<typeof proposalSchema>;

export interface GenerationConstraint {
  maxKcalPerServing?: number;
  minProteinPerServing?: number;
  includeConcepts?: string[];
  mealType?: "breakfast" | "lunch" | "dinner" | "snack";
}

export interface GenerationOutcome {
  ok: boolean;
  error?: string;
  recipeId?: string;
  computed?: { kcalPerServing: number | null; proteinPerServing: number | null };
  rejectionReason?: string;
}

export async function generateRecipeWithAI(constraint: GenerationConstraint): Promise<GenerationOutcome> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };

  const provider = getAIProvider();
  if (!provider.configured) return { ok: false, error: "ai-not-configured" };

  const concepts = await db.select().from(foodConcept).where(isNull(foodConcept.ownerUserId));
  const catalog = concepts
    .map((c) => `${c.slug} (${c.nameFr})`)
    .slice(0, 160)
    .join(", ");

  const constraintText = [
    constraint.maxKcalPerServing ? `at most ${String(constraint.maxKcalPerServing)} kcal per serving` : null,
    constraint.minProteinPerServing ? `at least ${String(constraint.minProteinPerServing)} g protein per serving` : null,
    constraint.mealType ? `suitable for ${constraint.mealType}` : null,
    constraint.includeConcepts?.length ? `must use some of: ${constraint.includeConcepts.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  try {
    const proposal = await provider.generateStructured({
      system:
        "You propose structured recipes for a nutrition app. Answer with JSON only. " +
        "Use ONLY concept slugs from the provided catalog. Quantities are per full recipe (all servings). " +
        "The application will independently verify nutrition; never state nutrition values.",
      user:
        `Recipe constraints: ${constraintText || "balanced main dish"}.\n` +
        `Concept catalog (slug (french name)): ${catalog}.\n` +
        'Units MUST be exactly one of: g, kg, ml, cl, l, unit. ' +
        'Respond with JSON: {"nameFr","nameEn","servings","mealTypes","ingredients":[{"conceptSlug","quantity","unit"}],"steps":[...]}',
      schema: proposalSchema,
      maxTokens: 5000,
    });

    // Map slugs → concepts; unknown slug rejects the ingredient (no guessing).
    const conceptBySlug = new Map(concepts.map((c) => [c.slug, c]));
    let inputs: (IngredientNutrition & { slug: string; conceptId: string })[] = [];
    for (const ing of proposal.ingredients) {
      const concept = conceptBySlug.get(ing.conceptSlug);
      if (!concept) continue;
      const nutrition = conceptNutrition(concept);
      if (!nutrition) continue;
      // Normalize the units we know; drop the rest rather than guess
      // (an exotic unit like "une pincée" skips that ingredient cleanly).
      const normalized = normalizeUnit(ing.quantity, ing.unit.trim().toLowerCase());
      if (!normalized) continue;
      const amount = normalized.amount;
      const unit = normalized.unit;
      inputs.push({
        slug: ing.conceptSlug,
        conceptId: concept.id,
        quantity: { amount, unit },
        nutrition,
      });
    }
    if (inputs.length < 2) return { ok: false, rejectionReason: "unresolvable-ingredients" };

    // Dimension mismatches (e.g. "1 unité" of a per-100 g food) drop that
    // ingredient — we never guess a per-unit weight.
    let totals;
    try {
      totals = totalNutrition(inputs);
    } catch {
      const massOnly = inputs.filter(
        (i) => !(i.quantity.unit === "unit" && i.nutrition?.basis === "100g"),
      );
      if (massOnly.length < 2) return { ok: false, rejectionReason: "unresolvable-ingredients" };
      inputs = massOnly;
      totals = totalNutrition(inputs);
    }
    const kcalPerServing = totals.energyKcal !== null ? Math.round(totals.energyKcal / proposal.servings) : null;
    const proteinPerServing = totals.proteinG !== null ? Math.round(totals.proteinG / proposal.servings) : null;

    if (constraint.maxKcalPerServing && (kcalPerServing ?? 0) > constraint.maxKcalPerServing) {
      await logExtraction(session.userId, "rejected", { reason: "kcal", kcalPerServing });
      return { ok: false, rejectionReason: `kcal-exceeded (${String(kcalPerServing)})`, computed: { kcalPerServing, proteinPerServing } };
    }
    if (constraint.minProteinPerServing && (proteinPerServing ?? 0) < constraint.minProteinPerServing) {
      await logExtraction(session.userId, "rejected", { reason: "protein", proteinPerServing });
      return { ok: false, rejectionReason: `protein-too-low (${String(proteinPerServing)} g)`, computed: { kcalPerServing, proteinPerServing } };
    }

    // Persist: AI proposed the structure, we verified the numbers.
    const inserted = (
      await db
        .insert(recipe)
        .values({
          ownerUserId: session.userId,
          nameFr: proposal.nameFr,
          nameEn: proposal.nameEn,
          servings: proposal.servings,
          mealTypes: proposal.mealTypes,
          instructions: proposal.steps,
          source: "ai",
          aiRequest: { constraint },
        })
        .returning()
    )[0]!;
    for (const input of inputs) {
      await db.insert(recipeIngredient).values({
        recipeId: inserted.id,
        foodConceptId: input.conceptId,
        quantity: String(input.quantity.amount),
        unit: input.quantity.unit,
      });
    }
    await logExtraction(session.userId, "valid", { recipeId: inserted.id, kcalPerServing, proteinPerServing });

    return { ok: true, recipeId: inserted.id, computed: { kcalPerServing, proteinPerServing } };
  } catch (err) {
    // Surface the real reason (schema failures include the raw model output).
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "failed" };
  }
}

async function logExtraction(userId: string, validation: "valid" | "rejected", output: unknown) {
  await db.insert(aiExtraction).values({
    kind: "recipe_candidate",
    userId,
    model: process.env.ZAI_TEXT_MODEL ?? "glm-5.3",
    promptVersion: "recipe-v1",
    output: output as object,
    validationStatus: validation,
  });
}

const KNOWN_UNITS = new Set(["g", "kg", "ml", "cl", "l", "unit", "unité", "units", "pièce", "pieces"]);

function normalizeUnit(
  quantity: number,
  unit: string,
): { amount: number; unit: "g" | "ml" | "unit" } | null {
  if (!KNOWN_UNITS.has(unit)) return null;
  if (unit === "kg") return { amount: quantity * 1000, unit: "g" };
  if (unit === "cl") return { amount: quantity * 10, unit: "ml" };
  if (unit === "l") return { amount: quantity * 1000, unit: "ml" };
  if (unit === "unité" || unit === "units" || unit === "pièce" || unit === "pieces") return { amount: quantity, unit: "unit" };
  return { amount: quantity, unit: unit as "g" | "ml" | "unit" };
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
