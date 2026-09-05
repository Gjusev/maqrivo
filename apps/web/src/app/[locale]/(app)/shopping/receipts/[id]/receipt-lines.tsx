"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  addReceiptLineToPantryAction,
  confirmReceiptLineAction,
  extractReceiptAction,
} from "@/server/receipts/actions";
import type { ReceiptLineView } from "@/server/receipts/actions";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";

function money(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * Extract → confirm → record: the AI proposes lines read off the photo;
 * only user confirmation creates price observations.
 */
export function ReceiptLines({ receiptId, initialLines }: { receiptId: string; initialLines: ReceiptLineView[] }) {
  const t = useTranslations("Receipts");
  const locale = useLocale();
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [syncedInitial, setSyncedInitial] = useState(initialLines);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pantryAdded, setPantryAdded] = useState<Record<string, boolean>>({});

  // router.refresh() delivers new server props after extraction; adopt them.
  if (initialLines !== syncedInitial) {
    setSyncedInitial(initialLines);
    setLines(initialLines);
  }

  async function extract() {
    setExtracting(true);
    setError(null);
    const result = await extractReceiptAction(receiptId);
    setExtracting(false);
    if (result.ok) {
      // Full navigation: server components re-render with fresh suggestions.
      router.refresh();
    } else if (result.error === "ai-not-configured") {
      setError(t("aiNotConfigured"));
    } else {
      setError(t("extractFailed"));
    }
  }

  async function confirm(lineId: string) {
    const result = await confirmReceiptLineAction(lineId);
    if (result.ok) {
      setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, confirmed: true } : l)));
      router.refresh();
    } else {
      setError(t("confirmFailed"));
    }
  }

  async function toPantry(lineId: string) {
    const result = await addReceiptLineToPantryAction(lineId);
    if (result.ok) {
      setPantryAdded((prev) => ({ ...prev, [lineId]: true }));
      router.refresh();
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 p-3.5">
        <p className="text-sm font-semibold text-zinc-900">{t("lines")}</p>
        <button type="button" className="btn-secondary px-3 text-xs" disabled={extracting} onClick={() => void extract()}>
          <SparkleIcon size={14} aria-hidden />
          {extracting ? t("extracting") : t("extract")}
        </button>
      </div>

      {error ? <p className="px-3.5 pt-2 text-xs text-red-600">{error}</p> : null}

      <div className="p-3.5">
        {extracting ? (
          // Skeleton rows matching the line layout while the AI reads the photo.
          <ul className="space-y-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3">
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton-row h-4 w-2/3" />
                  <div className="skeleton-row h-3 w-1/3" />
                </div>
                <div className="skeleton-row h-4 w-12" />
              </li>
            ))}
          </ul>
        ) : lines.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("noLines")}</p>
        ) : (
          <ul className="rise-in space-y-2">
            {lines.map((line) => {
              const productLabel = line.productName ?? line.suggestion?.name ?? null;
              return (
                <li
                  key={line.id}
                  className={`flex items-center gap-2 rounded-xl border p-3 ${
                    line.confirmed ? "border-brand-200 bg-brand-50/40" : "border-zinc-200"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${line.confirmed ? "text-brand-900" : "text-zinc-900"}`}>
                      {line.label}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {productLabel ? (
                        <>
                          {t("matched")}: {productLabel}
                          {line.quantityKg !== null ? ` · ${String(line.quantityKg)} kg · ${money(Math.round(line.amountCents / line.quantityKg), locale)}${t("perKg")}` : ""}
                        </>
                      ) : (
                        t("noMatch")
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-zinc-900">{money(line.amountCents, locale)}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    {line.confirmed ? (
                      <>
                        <span className="pop-in inline-flex items-center gap-1 rounded-lg bg-brand-100 px-2.5 py-1.5 text-xs font-medium text-brand-800">
                          <CheckIcon size={13} weight="bold" aria-hidden />
                          {t("confirmed")}
                        </span>
                        {line.productId && !pantryAdded[line.id] ? (
                          <button
                            type="button"
                            className="flex size-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-brand-700"
                            aria-label={t("toPantry")}
                            title={t("toPantry")}
                            onClick={() => void toPantry(line.id)}
                          >
                            <PlusIcon size={15} aria-hidden />
                          </button>
                        ) : null}
                        {pantryAdded[line.id] ? (
                          <span className="text-xs text-brand-700">{t("inPantry")}</span>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary min-h-9 px-3 text-xs"
                        onClick={() => void confirm(line.id)}
                      >
                        <CheckIcon size={13} aria-hidden />
                        {t("confirm")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
