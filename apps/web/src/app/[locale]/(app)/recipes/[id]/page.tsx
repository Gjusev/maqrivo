import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { foodConcept, recipe, recipeIngredient } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { totalNutrition, type IngredientNutrition, type NutritionPer100 } from "@maqrivo/core";
import { formatQuantity } from "@maqrivo/core";
import { RecipeActions } from "../recipe-actions";
import { EditRecipeLink } from "./edit-recipe-link";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("Meals");
  const tc = await getTranslations("Common");
  const session = await getSessionContext();
  if (!session) notFound();

  const rows = (
    await db.select().from(recipe).where(eq(recipe.id, id)).limit(1)
  )[0];
  if (!rows) notFound();

  const ingredients = await db
    .select({ ing: recipeIngredient, concept: foodConcept })
    .from(recipeIngredient)
    .innerJoin(foodConcept, eq(recipeIngredient.foodConceptId, foodConcept.id))
    .where(eq(recipeIngredient.recipeId, id));

  const name = locale === "fr" ? (rows.nameFr ?? rows.nameEn) : (rows.nameEn ?? rows.nameFr);

  // Deterministic totals from structured ingredients — never asserted by AI.
  const nutritionInputs: IngredientNutrition[] = ingredients.map(({ ing, concept }) => ({
    quantity: { amount: Number(ing.quantity), unit: ing.unit as "g" | "kg" | "ml" | "l" | "unit" | "pack" },
    nutrition: conceptNutrition(concept),
  }));
  const totals = totalNutrition(nutritionInputs);

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{name}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {[
              `${rows.servings} ${t("servings")}`,
              rows.prepMinutes != null ? `${t("prepTime")} ${String(rows.prepMinutes)} ${t("minutes")}` : null,
              rows.cookMinutes != null ? `${t("cookTime")} ${String(rows.cookMinutes)} ${t("minutes")}` : null,
              ...rows.tags.slice(0, 3),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <RecipeActions recipeId={rows.id} favorite={false} own={rows.ownerUserId === session.userId} />
      </div>

      <div className="space-y-4">
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-zinc-900">{t("nutritionComputed")}</h2>
          {totals.unknownIngredients > 0 ? (
            <p className="mt-1 text-xs text-amber-600">{t("nutritionIncomplete")}</p>
          ) : null}
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-5">
            {(
              [
                ["kcal", totals.energyKcal],
                ["P", totals.proteinG],
                ["G", totals.carbohydrateG],
                ["L", totals.fatG],
                ["fibres", totals.fiberG],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-zinc-400">{label}</dt>
                <dd className="font-medium text-zinc-900">
                  {value === null ? "—" : label === "kcal" ? String(value) : `${String(value)} g`}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-zinc-400">
            {tc("per100g")} → {rows.servings} {t("servings")} · {t("scale")}{" "}
            <EditRecipeLink recipeId={rows.id} />
          </p>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-zinc-900">{t("ingredients")}</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {ingredients.map(({ ing, concept }) => (
              <li key={ing.id} className="flex items-baseline justify-between gap-3">
                <span className="text-zinc-700">{locale === "fr" ? concept.nameFr : concept.nameEn}</span>
                <span className="shrink-0 font-mono text-xs text-zinc-500">
                  {formatQuantity({ amount: Number(ing.quantity), unit: ing.unit as "g" }, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {rows.instructions && rows.instructions.length > 0 ? (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-zinc-900">{t("instructions")}</h2>
            <ol className="mt-2 list-inside list-decimal space-y-1.5 text-sm text-zinc-700">
              {rows.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </>
  );
}

/** Concept row → core NutritionPer100 (nullable fields stay unknown). */
function conceptNutrition(concept: typeof foodConcept.$inferSelect): NutritionPer100 | null {
  const anyValue =
    concept.energyKcal != null ||
    concept.proteinG != null ||
    concept.fatG != null ||
    concept.carbohydrateG != null;
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
