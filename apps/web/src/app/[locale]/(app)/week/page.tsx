import { getLocale, getTranslations } from "next-intl/server";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/server/db";
import { mealPlan, mealSlot, recipe, shoppingPlan } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { formatMoney } from "@maqrivo/core";
import { CalendarBlankIcon } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { Link } from "@/i18n/navigation";
import { WeekGrid } from "./week-grid";
import { GeneratePlanButton } from "./generate-plan-button";

export default async function WeekPage() {
  const t = await getTranslations("Week");
  const tm = await getTranslations("Meals");
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

  if (!plan) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState
          icon={CalendarBlankIcon}
          title={t("emptySlot")}
          action={<GeneratePlanButton variant="primary" />}
        />
      </>
    );
  }

  const slots = await db
    .select({ slot: mealSlot, recipeName: recipe.nameFr, recipeNameEn: recipe.nameEn })
    .from(mealSlot)
    .leftJoin(recipe, eq(mealSlot.recipeId, recipe.id))
    .where(eq(mealSlot.mealPlanId, plan.id));

  const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const dates: string[] = [];
  const start = new Date(`${plan.weekStart}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const slotsByDate = new Map(dates.map((d) => [d, slots.filter((s) => s.slot.slotDate === d)]));
  const distinctRecipes = new Set(slots.filter((s) => s.slot.recipeId).map((s) => s.slot.recipeId)).size;

  return (
    <>
      <PageHeader
        title={t("title")}
        action={<GeneratePlanButton />}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="card p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-400">{t("estimatedCost")}</p>
          <p className="mt-0.5 text-lg font-bold text-zinc-900">
            {shopping ? formatMoney({ amountCents: shopping.totalCents ?? 0, currency: "EUR" }, locale) : "—"}
          </p>
        </div>
        <div className="card p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-400">{t("distinctRecipes")}</p>
          <p className="mt-0.5 text-lg font-bold text-zinc-900">{String(distinctRecipes)}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-400">{tm("servings")}</p>
          <p className="mt-0.5 text-lg font-bold text-zinc-900">{String(slots.filter((s) => s.slot.recipeId).length)}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-400">{t("cookingTime")}</p>
          <p className="mt-0.5 text-lg font-bold text-zinc-900">
            {shopping?.solverStatus === "OPTIMAL" ? "OPTIMAL" : (shopping?.solverStatus ?? "—")}
          </p>
        </div>
      </div>

      <WeekGrid
        days={dayKeys.map((key, i) => ({
          dayKey: key,
          date: dates[i]!,
          slots: (slotsByDate.get(dates[i]!) ?? []).map((s) => ({
            id: s.slot.id,
            mealType: s.slot.mealType,
            recipeName: s.recipeName || s.recipeNameEn || null,
            recipeId: s.slot.recipeId,
            locked: s.slot.locked,
          })),
        }))}
      />

      <p className="mt-4 text-center text-xs text-zinc-400">
        <Link href="/shopping" className="text-brand-700 hover:underline">
          {t("title")} → shopping
        </Link>
      </p>
    </>
  );
}
