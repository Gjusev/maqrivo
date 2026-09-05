import { getLocale, getTranslations } from "next-intl/server";
import { formatMoney, priceTrend } from "@maqrivo/core";
import type { StorePriceHistory } from "@/server/prices/history";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import { MinusIcon } from "@phosphor-icons/react/dist/ssr/Minus";
import { PriceSparkline } from "./price-sparkline";

/**
 * Per-store price history: current price with trend, the shape of the
 * history, and where the current price sits in it. Statistics only —
 * every number traces back to observations.
 */
export async function PriceHistorySection({ groups }: { groups: StorePriceHistory[] }) {
  const t = await getTranslations("Products");
  const tf = await getTranslations("Freshness");
  const tc = await getTranslations("Common");
  const locale = await getLocale();

  const money = (cents: number) => formatMoney({ amountCents: cents, currency: "EUR" }, locale);

  return (
    <ul className="space-y-2">
      {groups.map((group) => {
        const trend = priceTrend(group.summary);
        const assessment = group.latestAssessment;
        const cheaperPct =
          assessment.cheaperThanShare !== null ? Math.round(assessment.cheaperThanShare * 100) : null;
        const pricierPct =
          assessment.pricierThanShare !== null ? Math.round(assessment.pricierThanShare * 100) : null;
        return (
          <li key={`${group.storeId}:${group.basis}`} className="card p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium text-zinc-900">{group.storeName}</p>
                {group.basis !== "unit" ? (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                    {group.basis === "per_kg" ? tc("perKg") : group.basis}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <p className="text-sm font-semibold tabular-nums text-zinc-900">{money(group.summary.latestCents)}</p>
                {trend === "UP" ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600">
                    <ArrowUpIcon size={12} weight="bold" aria-hidden />
                    {t("trendUp")}
                  </span>
                ) : trend === "DOWN" ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-700">
                    <ArrowDownIcon size={12} weight="bold" aria-hidden />
                    {t("trendDown")}
                  </span>
                ) : trend ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-zinc-400">
                    <MinusIcon size={12} weight="bold" aria-hidden />
                    {t("trendFlat")}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-1">
              <PriceSparkline points={group.points} />
            </div>

            <p className="mt-1 text-xs text-zinc-500">
              <span className="tabular-nums">{t("lowestPrice")} {money(group.summary.lowestCents)}</span>
              <span className="mx-1.5 text-zinc-300">·</span>
              <span className="tabular-nums">{t("averagePrice")} {money(group.summary.averageCents)}</span>
              <span className="mx-1.5 text-zinc-300">·</span>
              {t("observationsCount", { count: group.summary.count })}
            </p>

            {assessment.quality === "GOOD_DEAL" && cheaperPct !== null ? (
              <p className="mt-1 text-xs font-medium text-brand-700">
                {t("cheaperThanSeen", { pct: String(cheaperPct) })}
              </p>
            ) : assessment.quality === "PRICEY" && pricierPct !== null ? (
              <p className="mt-1 text-xs font-medium text-amber-600">
                {t("pricierThanSeen", { pct: String(pricierPct) })}
              </p>
            ) : null}

            {!group.latestFresh ? <p className="mt-1 text-xs text-amber-600">{tf("staleHint")}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
