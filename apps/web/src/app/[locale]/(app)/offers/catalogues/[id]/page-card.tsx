"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  addToBasketAction,
  confirmCandidateAction,
  extractPageAction,
} from "@/server/catalogues/actions";
import type { CatalogueCandidate } from "@/server/catalogues/extraction";
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
}: {
  catalogueId: string;
  pageId: string;
  pageNumber: number;
  defaultValidUntil: string | null;
  confirmedCount: number;
}) {
  const t = useTranslations("Catalogues");
  const locale = useLocale();
  const router = useRouter();
  const [candidates, setCandidates] = useState<CatalogueCandidate[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<number, string>>({});
  const [basketAdded, setBasketAdded] = useState<Record<number, boolean>>({});
  const [validUntil, setValidUntil] = useState(defaultValidUntil ?? "");
  const [fallbackUntil] = useState(() => new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10));

  async function extract() {
    setExtracting(true);
    setExtractError(null);
    const result = await extractPageAction(pageId);
    setExtracting(false);
    if (result.ok) {
      setCandidates(result.candidates ?? []);
      if (!validUntil) {
        const inNineDays = new Date();
        inNineDays.setDate(inNineDays.getDate() + 9);
        setValidUntil(inNineDays.toISOString().slice(0, 10));
      }
    } else if (result.error === "ai-not-configured") {
      setExtractError(t("aiNotConfigured"));
    } else {
      setExtractError(t("extractFailed"));
    }
  }

  async function confirm(candidate: CatalogueCandidate) {
    const promoPrice = candidate.promoPriceCents ?? candidate.regularPriceCents;
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
      loyalty: candidate.loyalty,
      validUntil: validUntil || fallbackUntil,
    });
    if (result.ok && result.promotionId) {
      setConfirmed((prev) => ({ ...prev, [candidate.index]: result.promotionId! }));
      router.refresh();
    }
  }

  async function addToBasket(candidateIndex: number) {
    const promotionId = confirmed[candidateIndex];
    if (!promotionId) return;
    const result = await addToBasketAction(promotionId);
    if (result.ok) {
      setBasketAdded((prev) => ({ ...prev, [candidateIndex]: true }));
      router.refresh();
    }
  }

  return (
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

      {/* The page itself — pinch/zoom via native browser on the raw image. */}
      <a href={`/api/catalogues/pages/${pageId}/image`} target="_blank" rel="noreferrer" className="block bg-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, non-optimized local upload */}
        <img
          src={`/api/catalogues/pages/${pageId}/image`}
          alt={`${t("evidencePhoto")} ${String(pageNumber)}`}
          className="max-h-96 w-full object-contain"
          loading="lazy"
        />
      </a>

      {extractError ? <p className="px-3.5 pt-2 text-xs text-red-600">{extractError}</p> : null}

      {candidates !== null ? (
        <div className="border-t border-zinc-100 p-3.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t("candidates")}</p>
          {candidates.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("noCandidates")}</p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
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
              </div>
              <ul className="space-y-2">
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
                            MECHANISM_LABELS[candidate.mechanism] ?? "",
                            candidate.position ?? "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="mt-0.5 text-sm">
                          <span className="font-semibold text-brand-700">{money(candidate.promoPriceCents ?? candidate.regularPriceCents, locale)}</span>
                          {candidate.regularPriceCents && candidate.promoPriceCents ? (
                            <span className="ml-1.5 text-xs text-zinc-400 line-through">{money(candidate.regularPriceCents, locale)}</span>
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
                            <button type="button" className="btn-primary min-h-9 px-3 text-xs" onClick={() => void addToBasket(candidate.index)}>
                              <BasketIcon size={14} aria-hidden />
                              {t("addToBasket")}
                            </button>
                          )
                        ) : (
                          <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => void confirm(candidate)}>
                            <CheckIcon size={14} aria-hidden />
                            {t("confirm")}
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
  );
}
