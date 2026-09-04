"use client";

import { useOptimistic, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@maqrivo/core";
import { setShoppingItemStatusAction } from "@/server/plans/actions";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CircleIcon } from "@phosphor-icons/react/dist/csr/Circle";
import { XCircleIcon } from "@phosphor-icons/react/dist/csr/XCircle";

export function ShoppingItemRow({
  itemId,
  productName,
  conceptName,
  count,
  packLabel,
  effectiveCents,
  priceFreshness,
  status,
  reasonCode,
  fromCatalogue,
}: {
  itemId: string;
  productName: string;
  fromCatalogue?: boolean;
  conceptName: string | null;
  count: number;
  packLabel: string | null;
  effectiveCents: number;
  priceFreshness: string;
  status: string;
  reasonCode: string | null;
}) {
  const t = useTranslations("Shopping");
  const tf = useTranslations("Freshness");
  const tc = useTranslations("Common");
  const t2 = useTranslations("Catalogues");
  const locale = useLocale();
  const [, startTransition] = useTransition();
  const [state, setState] = useOptimistic(status, (_current, next: string) => next);

  const setStatus = (next: "pending" | "purchased" | "unavailable" | "skipped") =>
    startTransition(async () => {
      setState(next);
      await setShoppingItemStatusAction(itemId, next);
    });

  return (
    <li className={`card flex items-center gap-3 p-3.5 ${state === "purchased" ? "opacity-50" : ""}`}>
      <button
        type="button"
        aria-label={state === "purchased" ? t("purchased") : t("markPurchased")}
        className={`shrink-0 ${state === "purchased" ? "text-brand-600" : "text-zinc-300 hover:text-zinc-400"}`}
        onClick={() => setStatus(state === "purchased" ? "pending" : "purchased")}
      >
        {state === "purchased" ? (
          <CheckCircleIcon size={22} weight="fill" aria-hidden />
        ) : (
          <CircleIcon size={22} aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium text-zinc-900 ${state === "purchased" ? "line-through" : ""}`}>
          {productName}
          {count > 1 ? <span className="ml-1.5 text-xs font-normal text-zinc-400">×{String(count)}</span> : null}
        </p>
        <p className="truncate text-xs text-zinc-500">
          {[
            conceptName,
            packLabel,
            fromCatalogue ? t2("fromCatalogue") : null,
            priceFreshness === "stale" ? tf("stale") : null,
            reasonCode === "PROMO_ACTIVATED" ? t("appliedPromotion") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <p className="shrink-0 font-semibold text-zinc-900">
        {formatMoney({ amountCents: effectiveCents, currency: "EUR" }, locale)}
      </p>
      {state === "pending" ? (
        <button
          type="button"
          className="btn-ghost px-2 text-zinc-300 hover:text-red-500"
          aria-label={t("markUnavailable")}
          onClick={() => setStatus("unavailable")}
        >
          <XCircleIcon size={18} aria-hidden />
        </button>
      ) : null}
      {state !== "pending" && state !== "purchased" ? (
        <button type="button" className="btn-ghost px-2 text-xs text-zinc-400" onClick={() => setStatus("pending")}>
          {tc("retry")}
        </button>
      ) : null}
    </li>
  );
}
