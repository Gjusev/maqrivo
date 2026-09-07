"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  addToBasketAction,
  confirmCandidateAction,
  extractPageAction,
} from "@/server/catalogues/actions";
import { applyPrintedDates } from "@/server/catalogues/extraction";
import type { CatalogueCandidate } from "@/server/catalogues/extraction";
import { Lightbox } from "@/components/lightbox";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { BasketIcon } from "@phosphor-icons/react/dist/csr/Basket";

function money(cents: number | null, locale: string): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}

const MECHANISM_LABELS: Record<string, string> = {
  PROMO_PRICE: "prix promo",
  PERCENTAGE_OFF: "%",
  MULTIBUY: "lot",
  SECOND_UNIT_DISCOUNT: "2ᵉ",
  LOYALTY_PRICE: "carte",
  OTHER: "?",
};

/**
 * One leaflet page: photo on top, "extract" button, then tappable deal
 * cards. Confirm → promotion; add → shopping list. Nothing auto-saves.
 */
export function PageCard({
  catalogueId,
  pageId,
  pageNumber,
  defaultValidUntil,
  confirmedCount,
  initialCandidates,
}: {
  catalogueId: string;
  pageId: string;
  pageNumber: number;
  defaultValidUntil: string | null;
  confirmedCount: number;
  /** Persisted candidates from the latest extraction; null = never extracted, [] = ran but empty. */
  initialCandidates?: CatalogueCandidate[] | null;
}) {
  const t = useTranslations("Catalogues");
  const te = useTranslations("Errors");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  // Hydrated from the latest persisted extraction: [] means extraction ran
  // and found nothing, null means the page was never extracted.
  const [candidates, setCandidates] = useState<CatalogueCandidate[] | null>(initialCandidates ?? null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState<Record<number, boolean>>({});
  const [bulkPending, setBulkPending] = useState(false);
  const [basketAdded, setBasketAdded] = useState<Record<number, boolean>>({});
  const [basketPending, setBasketPending] = useState<Record<number, boolean>>({});
  const [zoomed, setZoomed] = useState(false);
  const [validUntil, setValidUntil] = useState(() =>
    initialCandidates?.length ? applyPrintedDates(initialCandidates, defaultValidUntil) : (defaultValidUntil ?? ""),
  );
  const [fallbackUntil] = useState(() => new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10));

  /** Typed server error codes → visible messages; unknown codes stay generic. */
  function mapActionError(code: string | undefined): string {
    if (code === "no-enabled-store") return t("noEnabledStore");
    if (code === "price-required") return t("priceRequired");
    return te("error");
  }

  async function extract() {
    setExtracting(true);
    setExtractError(null);
    const result = await extractPageAction(pageId);
    setExtracting(false);
    if (result.ok) {
      const list = result.candidates ?? [];
      setCandidates(list);
      // Prefer the validity printed on the leaflet itself when the model
      // read one; shared with hydration via applyPrintedDates.
      setValidUntil(applyPrintedDates(list, validUntil));
    } else if (result.error === "ai-not-configured") {
      setExtractError(t("aiNotConfigured"));
    } else {
      setExtractError(t("extractFailed"));
    }
  }

  async function confirm(candidate: CatalogueCandidate, opts?: { skipRefresh?: boolean }) {
    if (confirming[candidate.index]) return;
    setActionError(null);
    setConfirming((prev) => ({ ...prev, [candidate.index]: true }));
    // A pct-only deal has no printed promo price; passing the regular price
    // as the "promo" price would erase the discount — send discountPct instead.
    const isPctDeal = candidate.mechanism === "PERCENTAGE_OFF";
    const promoPrice = isPctDeal ? candidate.promoPriceCents : candidate.promoPriceCents ?? candidate.regularPriceCents;
    const result = await confirmCandidateAction({
      catalogueId,
      pageId,
      description: candidate.description,
      brand: candidate.brand,
      mechanism: candidate.mechanism,
      promoPriceCents: promoPrice,
      regularPriceCents: candidate.regularPriceCents,
      pricePerKgCents: candidate.pricePerKgCents,
      bundleQty: candidate.bundleQty,
      discountPct: isPctDeal ? candidate.discountPct : null,
      loyalty: candidate.loyalty,
      validUntil: validUntil || fallbackUntil,
    });
    setConfirming((prev) => ({ ...prev, [candidate.index]: false }));
    // `duplicate: true` is an idempotent success — same treatment, no special UI.
    if (result.ok && result.promotionId) {
      setConfirmed((prev) => ({ ...prev, [candidate.index]: result.promotionId! }));
      if (!opts?.skipRefresh) router.refresh();
    } else if (!result.ok) {
      setActionError(mapActionError(result.error));
    }
  }

  /** A leaflet page often carries 10+ offers; confirm the whole page in one tap. */
  async function confirmAll() {
    if (!candidates) return;
    const pending = candidates.filter((c) => !confirmed[c.index]);
    setBulkPending(true);
    for (const candidate of pending) {
      await confirm(candidate, { skipRefresh: true });
    }
    setBulkPending(false);
    // One refresh for the whole batch, not one per candidate.
    router.refresh();
  }

  async function addToBasket(candidateIndex: number) {
    const promotionId = confirmed[candidateIndex];
    if (!promotionId || basketPending[candidateIndex]) return;
    setActionError(null);
    setBasketPending((prev) => ({ ...prev, [candidateIndex]: true }));
    const result = await addToBasketAction(promotionId);
    setBasketPending((prev) => ({ ...prev, [candidateIndex]: false }));
    if (result.ok) {
      setBasketAdded((prev) => ({ ...prev, [candidateIndex]: true }));
      router.refresh();
    } else {
      setActionError(mapActionError(result.error));
    }
  }

  return (
    <>
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 p-3.5">
          <p className="text-sm font-semibold text-zinc-900">
            {t("evidencePhoto")} · {String(pageNumber)}
            {confirmedCount > 0 ? (
              <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
                {String(confirmedCount)} ✓
              </span>
            ) : null}
          </p>
          <button type="button" className="btn-secondary px-3 text-xs" disabled={extracting} onClick={() => void extract()}>
            <SparkleIcon size={14} aria-hidden />
            {extracting ? t("extracting") : t("extract")}
          </button>
        </div>

        {/* The page itself — opens the in-app zoomable lightbox. */}
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="block w-full cursor-zoom-in bg-zinc-100"
          aria-label={`${t("evidencePhoto")} ${String(pageNumber)}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, non-optimized local upload */}
          <img
            src={`/api/catalogues/pages/${pageId}/image`}
            alt={`${t("evidencePhoto")} ${String(pageNumber)}`}
            className="max-h-96 w-full object-contain"
            loading="lazy"
          />
        </button>

        {extractError ? <p className="px-3.5 pt-2 text-xs text-red-600">{extractError}</p> : null}

        {extracting ? (
          // Skeleton candidates matching the deal-card layout.
          <div className="border-t border-zinc-100 p-3.5" aria-hidden="true">
            <div className="skeleton-row mb-3 h-3 w-24" />
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3">
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton-row h-4 w-3/4" />
                    <div className="skeleton-row h-3 w-1/2" />
                    <div className="skeleton-row h-4 w-16" />
                  </div>
                  <div className="skeleton-row h-9 w-20 rounded-lg" />
                </li>
              ))}
            </ul>
          </div>
        ) : candidates !== null ? (
          <div className="border-t border-zinc-100 p-3.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("candidates")}</p>
            {actionError ? <p className="mb-2 text-xs text-red-600">{actionError}</p> : null}
            {candidates.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("noCandidates")}</p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <label htmlFor={`valid-${pageId}`} className="text-xs text-zinc-500">
                    {t("validity")}
                  </label>
                  <input
                    id={`valid-${pageId}`}
                    type="date"
                    className="min-h-9 py-1 text-xs"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                  {candidates.some((c) => !confirmed[c.index]) ? (
                    <button
                      type="button"
                      className="btn-secondary ml-auto min-h-9 px-3 text-xs"
                      disabled={bulkPending}
                      onClick={() => void confirmAll()}
                    >
                      <CheckIcon size={14} aria-hidden />
                      {bulkPending ? t("confirming") : t("confirmAll")}
                    </button>
                  ) : null}
                </div>
                <ul className="rise-in space-y-2">
                  {candidates.map((candidate) => {
                    const promotionId = confirmed[candidate.index];
                    const added = basketAdded[candidate.index];
                    return (
                      <li key={candidate.index} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900">{candidate.description}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {[
                              candidate.brand,
                              candidate.packSize,
                              MECHANISM_LABELS[candidate.mechanism] ?? "",
                              candidate.position ?? "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <p className="mt-0.5 text-sm">
                            <span className="font-semibold text-brand-700">{money(candidate.promoPriceCents ?? candidate.regularPriceCents, locale)}</span>
                            {candidate.regularPriceCents && candidate.promoPriceCents ? (
                              <>
                                <span className="ml-1.5 text-xs text-zinc-400 line-through">{money(candidate.regularPriceCents, locale)}</span>
                                {candidate.promoPriceCents < candidate.regularPriceCents ? (
                                  <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                                    -{String(Math.round((1 - candidate.promoPriceCents / candidate.regularPriceCents) * 100))} %
                                  </span>
                                ) : null}
                              </>
                            ) : null}
                            {candidate.pricePerKgCents ? (
                              <span className="ml-1.5 text-xs text-zinc-500">{money(candidate.pricePerKgCents, locale)}/kg</span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          {promotionId ? (
                            added ? (
                              <span className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand-50 px-3 text-xs font-medium text-brand-800">
                                <CheckIcon size={14} weight="bold" aria-hidden />
                                {t("addedToBasket")}
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="btn-primary min-h-9 px-3 text-xs"
                                disabled={Boolean(basketPending[candidate.index])}
                                onClick={() => void addToBasket(candidate.index)}
                              >
                                <BasketIcon size={14} aria-hidden />
                                {t("addToBasket")}
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary min-h-9 px-3 text-xs"
                              disabled={bulkPending || Boolean(confirming[candidate.index])}
                              onClick={() => void confirm(candidate)}
                            >
                              <CheckIcon size={14} aria-hidden />
                              {confirming[candidate.index] ? t("confirming") : t("confirm")}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </section>
      {zoomed ? (
        <Lightbox
          src={`/api/catalogues/pages/${pageId}/image`}
          alt={`${t("evidencePhoto")} ${String(pageNumber)}`}
          closeLabel={tc("close")}
          onClose={() => setZoomed(false)}
        />
      ) : null}
    </>
  );
}
