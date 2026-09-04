"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney, freshnessOf } from "@maqrivo/core";

export interface PriceRow {
  id: string;
  storeName: string;
  amountCents: number;
  priceBasis: string;
  discounted: boolean;
  regularAmountCents: number | null;
  observedAt: string;
  source: string;
}

export function PriceList({ observations }: { observations: PriceRow[] }) {
  const t = useTranslations("Products");
  const tf = useTranslations("Freshness");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const [now] = useState(() => Date.now());

  return (
    <ul className="space-y-2">
      {observations.map((o) => {
        const freshness = freshnessOf(new Date(o.observedAt), o.source as never, new Date(now));
        const days = Math.floor((now - new Date(o.observedAt).getTime()) / 86_400_000);
        return (
          <li key={o.id} className="card flex items-center justify-between gap-3 p-3.5">
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-900">{o.storeName}</p>
              <p className="text-xs text-zinc-500">
                {days === 0
                  ? t("observedToday")
                  : days < 7
                    ? t("observedDaysAgo", { count: days })
                    : t("observedWeeksAgo", { count: Math.floor(days / 7) })}
              </p>
              {freshness.state === "stale" ? <p className="text-xs text-amber-600">{tf("staleHint")}</p> : null}
            </div>
            <div className="shrink-0 text-right">
              <p className={`font-semibold ${o.discounted ? "text-brand-700" : "text-zinc-900"}`}>
                {formatMoney({ amountCents: o.amountCents, currency: "EUR" }, locale)}
                <span className="ml-1 text-xs font-normal text-zinc-400">
                  {o.priceBasis === "per_kg" ? tc("perKg") : o.priceBasis === "unit" ? "" : o.priceBasis}
                </span>
              </p>
              {o.regularAmountCents ? (
                <p className="text-xs text-zinc-400 line-through">
                  {formatMoney({ amountCents: o.regularAmountCents, currency: "EUR" }, locale)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
