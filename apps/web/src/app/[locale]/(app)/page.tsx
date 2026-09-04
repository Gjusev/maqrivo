import { getLocale, getTranslations } from "next-intl/server";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/server/db";
import {
  foodConcept,
  mealPlan,
  mealSlot,
  nutritionProfile,
  pantryItem,
  recipe,
  recipeIngredient,
  shoppingPlan,
} from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { formatMoney, totalNutrition, type IngredientNutrition, type NutritionPer100 } from "@maqrivo/core";
import { CalendarBlankIcon } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { Link } from "@/i18n/navigation";
import { GeneratePlanButton } from "./week/generate-plan-button";

export default async function TodayPage() {
  const t = await getTranslations("Today");
  const locale = await getLocale();
  const session = await getSessionContext();
  if (!session) return null;

  const plan = (
    await db
      .select()
      .from(mealPlan)
      .where(and(eq(mealPlan.userId, session.userId), eq(mealPlan.status, "active")))
      .orderBy(desc(mealPlan.createdAt))
      .limit(1)
  )[0];
  const shopping = (
    await db
      .select()
      .from(shoppingPlan)
      .where(and(eq(shoppingPlan.userId, session.userId), eq(shoppingPlan.status, "active")))
      .orderBy(desc(shoppingPlan.createdAt))
      .limit(1)
  )[0];
  const profile = (
    await db
      .select()
      .from(nutritionProfile)
      .where(eq(nutritionProfile.userId, session.userId))
      .orderBy(desc(nutritionProfile.createdAt))
      .limit(1)
  )[0];

  const todayIso = new Date().toISOString().slice(0, 10);

  if (!plan) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState
          icon={CalendarBlankIcon}
          title={t("noPlan")}
          body={session.locationLabel ?? undefined}
          action={<GeneratePlanButton variant="primary" />}
        />
      </>
    );
  }

  // Today's slots with deterministic per-meal nutrition.
  const todaySlots = await db
    .select({ slot: mealSlot, recipe: recipe })
    .from(mealSlot)
    .leftJoin(recipe, eq(mealSlot.recipeId, recipe.id))
    .where(and(eq(mealSlot.mealPlanId, plan.id), eq(mealSlot.slotDate, todayIso)));

  const dayNutrition = { kcal: 0, protein: 0 };
  for (const { slot, recipe: r } of todaySlots) {
    if (!r) continue;
    const ings = await db
      .select({ ing: recipeIngredient, concept: foodConcept })
      .from(recipeIngredient)
      .innerJoin(foodConcept, eq(recipeIngredient.foodConceptId, foodConcept.id))
      .where(eq(recipeIngredient.recipeId, r.id));
    const inputs: IngredientNutrition[] = ings.map(({ ing, concept }) => ({
      quantity: { amount: Number(ing.quantity), unit: ing.unit as "g" },
      nutrition: conceptToNutrition(concept),
    }));
    const totals = totalNutrition(inputs);
    if (totals.energyKcal != null) dayNutrition.kcal += Math.round((totals.energyKcal / r.servings) * slot.servings);
    if (totals.proteinG != null) dayNutrition.protein += Math.round((totals.proteinG / r.servings) * slot.servings);
  }

  // Pantry notices: expiring within 3 days.
  const pantry = await db
    .select({ item: pantryItem, concept: foodConcept })
    .from(pantryItem)
    .leftJoin(foodConcept, eq(pantryItem.foodConceptId, foodConcept.id))
    .where(eq(pantryItem.userId, session.userId));
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  const expiring = pantry.filter(
    (p) => p.item.status === "active" && p.item.expiresOn !== null && p.item.expiresOn! <= soon.toISOString().slice(0, 10),
  );

  const kcalTarget = profile?.dailyKcal ?? null;
  const proteinTarget = profile?.proteinG ?? null;

  return (
    <>
      <PageHeader title={t("title")} />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="card p-3.5">
            <p className="text-xs uppercase tracking-wide text-zinc-400">{t("calories")}</p>
            <p className="mt-0.5 text-2xl font-bold text-zinc-900">
              {String(dayNutrition.kcal)}
              {kcalTarget ? <span className="text-sm font-normal text-zinc-400"> / {String(kcalTarget)}</span> : null}
            </p>
            {kcalTarget ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${String(Math.min(100, Math.round((dayNutrition.kcal / kcalTarget) * 100)))}%` }}
                />
              </div>
            ) : null}
          </div>
          <div className="card p-3.5">
            <p className="text-xs uppercase tracking-wide text-zinc-400">{t("protein")}</p>
            <p className="mt-0.5 text-2xl font-bold text-zinc-900">
              {String(dayNutrition.protein)} g
              {proteinTarget ? <span className="text-sm font-normal text-zinc-400"> / {String(proteinTarget)} g</span> : null}
            </p>
            {proteinTarget ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${String(Math.min(100, Math.round((dayNutrition.protein / proteinTarget) * 100)))}%` }}
                />
              </div>
            ) : null}
          </div>
        </div>

        <section className="card divide-y divide-zinc-100">
          {todaySlots.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">{t("noPlan")}</p>
          ) : (
            todaySlots.map(({ slot, recipe: r }) => (
              <div key={slot.id} className="flex items-center gap-3 p-3.5">
                <span className="w-24 shrink-0 text-xs font-medium capitalize text-zinc-400">
                  {t(slot.mealType as never)}
                </span>
                {r ? (
                  <Link href={`/recipes/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-zinc-800 hover:text-brand-700">
                    {locale === "fr" ? (r.nameFr ?? r.nameEn) : (r.nameEn ?? r.nameFr)}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 italic text-zinc-300">—</span>
                )}
              </div>
            ))
          )}
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-zinc-900">{t("pantryNotices")}</h2>
          {expiring.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-500">{t("nothingExpiring")}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {expiring.map(({ item, concept }) => (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700">{concept ? (locale === "fr" ? concept.nameFr : concept.nameEn) : (item.label ?? "?")}</span>
                  <span className="text-xs font-medium text-amber-600">
                    {item.expiresOn}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {shopping ? (
          <Link href="/shopping" className="card flex items-center justify-between p-4 transition-colors hover:border-zinc-300">
            <span className="text-sm font-medium text-zinc-700">{t("createPlan")} →</span>
            <span className="font-bold text-zinc-900">
              {formatMoney({ amountCents: shopping.totalCents ?? 0, currency: "EUR" }, locale)}
            </span>
          </Link>
        ) : null}
      </div>
    </>
  );
}

function conceptToNutrition(concept: typeof foodConcept.$inferSelect): NutritionPer100 | null {
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
