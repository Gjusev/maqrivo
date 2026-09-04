import { getLocale, getTranslations } from "next-intl/server";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/server/db";
import { foodConcept, product, shoppingItem, shoppingPlan, shoppingPlanStore, store } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { formatMoney } from "@maqrivo/core";
import { BasketIcon } from "@phosphor-icons/react/dist/ssr/Basket";
import { Link } from "@/i18n/navigation";
import { ShoppingItemRow } from "./shopping-item-row";

export default async function ShoppingPage() {
  const t = await getTranslations("Shopping");
  const tc = await getTranslations("Common");
  const t2 = await getTranslations("Receipts");
  const locale = await getLocale();
  const session = await getSessionContext();
  if (!session) return null;

  const plan = (
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
        <PageHeader
        title={t("title")}
        action={
          <Link href="/shopping/receipts" className="btn-secondary text-xs">
            {t2("title")}
          </Link>
        }
      />
        <EmptyState
          icon={BasketIcon}
          title={t("noShoppingPlan")}
          action={
            <Link href="/week" className="btn-primary">
              {t("title")} → week
            </Link>
          }
        />
      </>
    );
  }

  const storeRows = await db
    .select({ sps: shoppingPlanStore, store: store })
    .from(shoppingPlanStore)
    .innerJoin(store, eq(shoppingPlanStore.storeId, store.id))
    .where(eq(shoppingPlanStore.shoppingPlanId, plan.id))
    .orderBy(shoppingPlanStore.sequenceIndex);

  const items = await db
    .select({ item: shoppingItem, product: product, concept: foodConcept })
    .from(shoppingItem)
    .leftJoin(product, eq(shoppingItem.productId, product.id))
    .leftJoin(foodConcept, eq(product.foodConceptId, foodConcept.id))
    .where(eq(shoppingItem.shoppingPlanId, plan.id))
    .orderBy(shoppingItem.sortOrder);

  const summary = (plan.summary ?? {}) as {
    reasons?: { code: string; params?: Record<string, string | number> }[];
    uncoveredRequirements?: string[];
    budgetOverrunCents?: number;
  };
  const uncoveredConcepts = summary.uncoveredRequirements?.length
    ? await db.select({ id: foodConcept.id, fr: foodConcept.nameFr, en: foodConcept.nameEn }).from(foodConcept)
    : [];
  const uncoveredNames = (summary.uncoveredRequirements ?? []).map(
    (id) => {
      const row = uncoveredConcepts.find((c) => c.id === id);
      return row ? (locale === "fr" ? row.fr : row.en) : id;
    },
  );
  const purchased = items.filter((i) => i.item.status === "purchased");
  const progress = items.length > 0 ? Math.round((purchased.length / items.length) * 100) : 0;

  if (items.length === 0) {
    return (
      <>
        <PageHeader
        title={t("title")}
        action={
          <Link href="/shopping/receipts" className="btn-secondary text-xs">
            {t2("title")}
          </Link>
        }
      />
        <EmptyState icon={BasketIcon} title={t("empty")} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        action={
          <Link href="/shopping/receipts" className="btn-secondary text-xs">
            {t2("title")}
          </Link>
        }
      />

      <div className="mb-4 card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            {tc("details")} · {String(purchased.length)}/{String(items.length)}
          </p>
          <p className="text-xl font-bold text-zinc-900">
            {formatMoney({ amountCents: plan.totalCents ?? 0, currency: "EUR" }, locale)}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${String(progress)}%` }} />
        </div>
        {summary.budgetOverrunCents && summary.budgetOverrunCents > 0 ? (
          <p className="mt-2 text-xs font-medium text-amber-600">
            {t("total")} + {formatMoney({ amountCents: summary.budgetOverrunCents, currency: "EUR" }, locale)}
          </p>
        ) : null}
      </div>

      {storeRows.length > 1 ? (
        <p className="mb-3 text-xs font-medium text-zinc-500">
          {t("storeSequence")}: {storeRows.map((s, i) => `${i + 1}. ${s.store.name}`).join(" → ")}
        </p>
      ) : null}

      <div className="space-y-6">
        {storeRows.map(({ sps, store: s }) => {
          const storeItems = items.filter((i) => i.item.storeId === s.id);
          if (storeItems.length === 0) return null;
          return (
            <section key={sps.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                <span className="flex size-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                  {String(sps.sequenceIndex + 1)}
                </span>
                {s.name}
              </h2>
              <ul className="space-y-2">
                {storeItems.map(({ item, product: p, concept }) => (
                  <ShoppingItemRow
                    key={item.id}
                    itemId={item.id}
                    productName={p?.name ?? item.label ?? "?"}
                    fromCatalogue={item.source === "catalogue"}
                    conceptName={concept ? (locale === "fr" ? concept.nameFr : concept.nameEn) : null}
                    count={item.packageCount ?? Number(item.purchaseQuantity)}
                    packLabel={p?.packageQuantity ? `${Number(p.packageQuantity)} ${p.packageUnit}` : null}
                    effectiveCents={item.effectiveCostCents}
                    priceFreshness={item.priceFreshness}
                    status={item.status}
                    reasonCode={item.reasons?.[0]?.code ?? null}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {summary.uncoveredRequirements && summary.uncoveredRequirements.length > 0 ? (
        <section className="mt-6 card border-amber-200 bg-amber-50/50 p-4">
          <h2 className="text-sm font-semibold text-amber-800">
            {t("uncoveredTitle")}
          </h2>
          <p className="mt-1 text-xs text-amber-700">
            {t("uncoveredHint")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {uncoveredNames.map((name) => (
              <li key={name} className="rounded-full bg-white px-2.5 py-0.5 text-xs text-amber-700">
                {name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
