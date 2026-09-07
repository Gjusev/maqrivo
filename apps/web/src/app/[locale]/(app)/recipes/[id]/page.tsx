import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { foodConcept, recipe, recipeIngredient, userRecipePrefs } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { totalNutrition, type IngredientNutrition, type NutritionPer100 } from "@maqrivo/core";
import { formatQuantity } from "@maqrivo/core";
import { Link } from "@/i18n/navigation";
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
    await db
      .select({ recipe: recipe, favorite: userRecipePrefs.favorite })
      .from(recipe)
      .leftJoin(
        userRecipePrefs,
        and(eq(userRecipePrefs.recipeId, recipe.id), eq(userRecipePrefs.userId, session.userId)),
      )
      .where(eq(recipe.id, id))
      .limit(1)
  )[0];
  if (!rows) notFound();
  const { recipe: r, favorite } = rows;

  const ingredients = await db
    .select({ ing: recipeIngredient, concept: foodConcept })
    .from(recipeIngredient)
    .innerJoin(foodConcept, eq(recipeIngredient.foodConceptId, foodConcept.id))
    .where(eq(recipeIngredient.recipeId, id));

  const name = locale === "fr" ? (r.nameFr ?? r.nameEn) : (r.nameEn ?? r.nameFr);

  // Deterministic totals from structured ingredients — never asserted by AI.
  const nutritionInputs: IngredientNutrition[] = ingredients.map(({ ing, concept }) => ({
    quantity: { amount: Number(ing.quantity), unit: ing.unit as "g" | "kg" | "ml" | "l" | "unit" | "pack" },
    nutrition: conceptNutrition(concept),
  }));
  const totals = totalNutrition(nutritionInputs);

  return (
    <>
      <Link href="/recipes" className="text-xs text-zinc-500 hover:text-brand-700">← {tc("back")}</Link>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{name}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {[
              `${r.servings} ${t("servings")}`,
              r.prepMinutes != null ? `${t("prepTime")} ${String(r.prepMinutes)} ${t("minutes")}` : null,
              r.cookMinutes != null ? `${t("cookTime")} ${String(r.cookMinutes)} ${t("minutes")}` : null,
              ...r.tags.slice(0, 3),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <RecipeActions recipeId={r.id} favorite={favorite ?? false} own={r.ownerUserId === session.userId} />
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
            {tc("per100g")} → {r.servings} {t("servings")} · {t("scale")}{" "}
            <EditRecipeLink recipeId={r.id} />
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

        {r.instructions && r.instructions.length > 0 ? (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-zinc-900">{t("instructions")}</h2>
            <ol className="mt-2 list-inside list-decimal space-y-1.5 text-sm text-zinc-700">
              {r.instructions.map((step, i) => (
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
