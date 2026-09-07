import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { foodConcept, product, productNutrition } from "@maqrivo/db";
import { getSessionContext, isAdmin } from "@/server/session";
import { priceHistoryForProduct } from "@/server/prices/history";
import { computeValueMetrics, formatMoney, freshnessOf } from "@maqrivo/core";
import { PriceHistorySection } from "./price-history";
import { Link } from "@/i18n/navigation";
import { AddPriceForm } from "./add-price-form";
import { ConceptLinker } from "./concept-linker";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("Products");
  const tf = await getTranslations("Freshness");
  const th = await getTranslations("HalalState");
  const tc = await getTranslations("Common");

  const rows = (
    await db
      .select({ product: product, nutrition: productNutrition, concept: foodConcept })
      .from(product)
      .leftJoin(productNutrition, eq(productNutrition.productId, product.id))
      .leftJoin(foodConcept, eq(product.foodConceptId, foodConcept.id))
      .where(eq(product.id, id))
      .limit(1)
  )[0];
  if (!rows) notFound();

  const session = await getSessionContext();
  const admin = await isAdmin();
  if (!session) notFound();

  const p = rows.product;
  const n = rows.nutrition;
  const history = await priceHistoryForProduct(p.id);
  const now = new Date();

  // Deterministic metrics on the freshest observation with known nutrition.
  // Product nutrition wins; concept nutrition is the honest fallback.
  // Per-kg observations convert to a pack-equivalent price for the metric.
  const best = history.freshest?.obs ?? null;
  const packGrams = p.packageQuantity !== null && p.packageUnit === "g" ? Number(p.packageQuantity) : null;
  const proteinPer100 = n?.proteinG != null ? Number(n.proteinG) : rows.concept?.proteinG != null ? Number(rows.concept.proteinG) : null;
  const kcalPer100 = n?.energyKcal ?? rows.concept?.energyKcal ?? null;
  // WEIGHT products: a per-kg observation is its own 1000 g basis.
  const metricBasis =
    packGrams != null && (best?.priceBasis === "unit" || best?.priceBasis === "per_kg")
      ? { grams: packGrams, priceCents: best.priceBasis === "unit" ? best.amountCents : Math.round((best.amountCents * packGrams) / 1000) }
      : p.purchasingMode === "WEIGHT" && best?.priceBasis === "per_kg"
        ? { grams: 1000, priceCents: best.amountCents }
        : null;
  const metrics =
    best && proteinPer100 != null && metricBasis
      ? computeValueMetrics({
          proteinPer100,
          energyKcalPer100: kcalPer100,
          priceCents: metricBasis.priceCents,
          quantityBase: metricBasis.grams,
          freshness: freshnessOf(best.observedAt, best.source, now),
        })
      : null;

  const conceptName = rows.concept ? (locale === "fr" ? rows.concept.nameFr : rows.concept.nameEn) : null;

  return (
    <>
      <Link href="/products" className="text-xs text-zinc-500 hover:text-brand-700">← {tc("back")}</Link>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{p.name}</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          {[
            p.brand,
            p.packageQuantity && p.packageUnit ? `${Number(p.packageQuantity)} ${p.packageUnit}` : null,
            p.purchasingMode === "WEIGHT" ? t("soldByWeight") : null,
            p.source === "off" ? "Open Food Facts" : null,
            p.barcode,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="space-y-4">
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-zinc-900">{th(p.halalState)}</h2>
        </section>

        {admin ? (
          <ConceptLinker productId={p.id} currentConceptId={p.foodConceptId} currentConceptName={conceptName} />
        ) : null}

        {n ? (
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-zinc-900">{n.basis === "100g" ? t("per100g") : t("per100ml")}</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
              {(
                [
                  [t("kcal"), n.energyKcal != null ? String(n.energyKcal) : "—"],
                  [t("proteinShort"), n.proteinG != null ? `${Number(n.proteinG)} g` : "—"],
                  [t("carbsShort"), n.carbohydrateG != null ? `${Number(n.carbohydrateG)} g` : "—"],
                  [t("fatShort"), n.fatG != null ? `${Number(n.fatG)} g` : "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-xs uppercase tracking-wide text-zinc-400">{label}</dt>
                  <dd className="font-medium text-zinc-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-zinc-400">
              {n.source === "off" ? "Open Food Facts" : n.source === "user" ? t("you") : n.source}
            </p>
          </section>
        ) : null}

        {metrics?.proteinPerEuro != null ? (
          <section className="card border-brand-200 bg-brand-50/60 p-4">
            <h2 className="text-sm font-semibold text-brand-800">{t("proteinPerEuro")}</h2>
            <p className="mt-1 text-2xl font-bold text-brand-800">{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(metrics.proteinPerEuro)} g/€</p>
            {metrics.costPer10gProteinCents != null ? (
              <p className="text-xs text-brand-700">
                {t("costPer10gProtein")}: {formatMoney({ amountCents: metrics.costPer10gProteinCents, currency: "EUR" }, locale)}
              </p>
            ) : null}
          </section>
        ) : history.freshest !== null ? (
          <p className="text-xs text-zinc-400">{t("metricUnavailable")}</p>
        ) : null}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">{t("priceHistory")}</h2>
          {history.groups.length === 0 ? (
            <p className="text-sm text-zinc-500">{tf("unknown")}</p>
          ) : (
            <PriceHistorySection groups={history.groups} />
          )}
        </section>

        <AddPriceForm productId={p.id} />
      </div>
    </>
  );
}
