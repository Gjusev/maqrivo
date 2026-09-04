import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { listActivePromotions } from "@/server/ingestion/promotions";
import { db } from "@/server/db";
import { formatMoney, type PromotionMechanism } from "@maqrivo/core";
import { PercentIcon } from "@phosphor-icons/react/dist/ssr/Percent";
import { desc, eq, isNotNull } from "drizzle-orm";
import { catalogue, retailer } from "@maqrivo/db";
import { NewPromotionButton } from "./new-promotion-button";
import { NewCatalogueButton } from "./catalogues/new-catalogue-button";
import { Link } from "@/i18n/navigation";

export default async function OffersPage() {
  const t = await getTranslations("Offers");
  const te = await getTranslations("Evidence");
  const locale = await getLocale();
  const promotions = await listActivePromotions();
  const tc2 = await getTranslations("Catalogues");
  const catalogues = await db
    .select({ cat: catalogue, retailerName: retailer.name })
    .from(catalogue)
    .innerJoin(retailer, eq(catalogue.retailerId, retailer.id))
    .where(isNotNull(catalogue.id))
    .orderBy(desc(catalogue.createdAt))
    .limit(10);

  return (
    <>
      <PageHeader
        title={t("title")}
        action={
          <div className="flex gap-2">
            <NewCatalogueButton />
            <NewPromotionButton />
          </div>
        }
      />

      {catalogues.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">{tc2("cataloguesTitle")}</h2>
          <ul className="space-y-2">
            {catalogues.map(({ cat: c, retailerName }) => (
              <li key={c.id}>
                <Link href={`/offers/catalogues/${c.id}`} className="card flex items-center justify-between p-3.5 transition-colors hover:border-zinc-300">
                  <span className="min-w-0 truncate text-sm font-medium text-zinc-900">
                    {c.title ?? `${retailerName} · ${tc2("cataloguesTitle")}`}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {[retailerName, c.validUntil].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {promotions.length === 0 ? (
        <EmptyState icon={PercentIcon} title={t("noOffers")} action={<NewPromotionButton variant="primary" />} />
      ) : (
        <ul className="space-y-2">
          {promotions.map(({ promotion: promo, retailerName, storeName }) => (
            <li key={promo.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">{promo.descriptionRaw}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {[retailerName, storeName ?? t("allStores"), promo.brand].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {promo.validUntil ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        {t("validUntil", { date: new Date(promo.validUntil).toLocaleDateString(locale) })}
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">{t("noDates")}</span>
                    )}
                    {promo.loyaltyRequired ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        {t("loyaltyRequired")}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                      {promo.source === "user" ? te("userObserved") : te("extracted")}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {promo.promoPriceCents != null ? (
                    <p className="text-lg font-bold text-brand-700">
                      {formatMoney({ amountCents: promo.promoPriceCents, currency: "EUR" }, locale)}
                    </p>
                  ) : null}
                  {promo.regularPriceCents != null ? (
                    <p className="text-xs text-zinc-400 line-through">
                      {formatMoney({ amountCents: promo.regularPriceCents, currency: "EUR" }, locale)}
                    </p>
                  ) : null}
                  <MechanismLabel mechanism={promo.mechanism} payQty={promo.minQty} getQty={promo.getQty} discountPct={promo.discountPct} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  function MechanismLabel(m: { mechanism: string; payQty: number | null; getQty: number | null; discountPct: number | null }) {
    const labels: Record<string, string> = {
      PROMO_PRICE: "",
      PERCENTAGE_OFF: m.discountPct ? `−${String(m.discountPct)} %` : "",
      CATEGORY_PROMO: m.discountPct ? `−${String(m.discountPct)} %` : "",
      MULTIBUY: m.payQty ? t("freeItem", { n: String(m.payQty) }) : "",
      BUY_X_GET_Y: m.getQty ? t("freeItem", { n: String(m.payQty && m.getQty ? m.payQty + m.getQty : m.getQty) }) : "",
      SECOND_UNIT_DISCOUNT: m.discountPct ? t("secondUnitDiscount", { pct: String(m.discountPct) }) : "",
      LOYALTY_PRICE: "carte",
      LOYALTY_CREDIT: "carte",
      CASHBACK: "cashback",
      COUPON: "coupon",
    };
    const label = labels[m.mechanism];
    if (!label) return null;
    return <p className="mt-0.5 text-xs font-medium text-zinc-500">{label}</p>;
  }
}

export type { PromotionMechanism };
