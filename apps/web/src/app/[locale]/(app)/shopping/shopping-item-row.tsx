"use client";

import { useOptimistic, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@maqrivo/core";
import { setShoppingItemStatusAction } from "@/server/plans/actions";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CircleIcon } from "@phosphor-icons/react/dist/csr/Circle";
import { XCircleIcon } from "@phosphor-icons/react/dist/csr/XCircle";

export interface ShoppingItemRowProps {
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
}

export function ShoppingItemRow(props: ShoppingItemRowProps) {
  const t = useTranslations("Shopping");
  const tf = useTranslations("Freshness");
  const t2 = useTranslations("Catalogues");
  const locale = useLocale();
  const [, startTransition] = useTransition();
  const [state, setState] = useOptimistic(props.status, (_current, next: string) => next);

  const setStatus = (next: "pending" | "purchased" | "unavailable" | "skipped") =>
    startTransition(async () => {
      setState(next);
      await setShoppingItemStatusAction(props.itemId, next);
    });

  const purchased = state === "purchased";

  const meta = [
    props.conceptName,
    props.packLabel,
    props.fromCatalogue ? t2("fromCatalogue") : null,
    props.priceFreshness === "stale" ? tf("stale") : null,
    props.reasonCode === "PROMO_ACTIVATED" ? t("appliedPromotion") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={`card flex items-center gap-2 p-3.5 transition-opacity ${purchased ? "opacity-50" : ""} ${
        state === "unavailable" ? "opacity-40" : ""
      }`}
    >
      {/* 44×44 touch target (thumb-friendly, in-store use) */}
      <button
        type="button"
        aria-label={purchased ? t("purchased") : t("markPurchased")}
        aria-pressed={purchased}
        className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-colors ${
          purchased ? "text-brand-600" : "text-zinc-300 hover:text-zinc-400"
        }`}
        onClick={() => setStatus(purchased ? "pending" : "purchased")}
      >
        {purchased ? (
          <CheckCircleIcon size={24} weight="fill" aria-hidden />
        ) : (
          <CircleIcon size={24} aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1 py-0.5">
        <p className={`truncate font-medium text-zinc-900 ${purchased ? "line-through" : ""}`}>
          {props.productName}
          {props.count > 1 ? (
            <span className="ml-1.5 text-xs font-normal text-zinc-400">×{String(props.count)}</span>
          ) : null}
        </p>
        {meta ? <p className="truncate py-0.5 text-xs leading-4 text-zinc-500">{meta}</p> : null}
      </div>
      <p className={`shrink-0 font-semibold ${purchased ? "text-zinc-400 line-through" : "text-zinc-900"}`}>
        {formatMoney({ amountCents: props.effectiveCents, currency: "EUR" }, locale)}
      </p>
      <button
        type="button"
        aria-label={t("markUnavailable")}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-300 hover:text-red-500"
        onClick={() => setStatus(state === "unavailable" ? "pending" : "unavailable")}
      >
        <XCircleIcon size={22} aria-hidden />
      </button>
    </li>
  );
}
