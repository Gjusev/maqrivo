"use client";

import { useMemo, useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { resolvePromotionMatchAction } from "@/server/offers/unmatched-actions";

export type PickerProduct = { id: string; name: string; brand: string | null };

/** Manual product link for an UNRESOLVED promotion: filter, pick, confirm. */
export function UnmatchedResolve({ promotionId, products }: { promotionId: string; products: PickerProduct[] }) {
  const t = useTranslations("Offers");
  const tc = useTranslations("Common");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? products.filter((p) => `${p.brand ?? ""} ${p.name}`.toLowerCase().includes(q)) : products;
    return base.slice(0, 100);
  }, [products, query]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productId || pending) return;
    setPending(true);
    setError(false);
    const result = await resolvePromotionMatchAction({ promotionId, productId });
    setPending(false);
    if (result.ok) {
      setDone(true);
      router.refresh();
    } else {
      setError(true);
    }
  }

  if (done) {
    return (
      <p aria-live="polite" className="mt-2 text-xs font-medium text-brand-700">
        {t("unmatchedResolved")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-40 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-900 focus:border-brand-500 focus:outline-none"
      />
      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="max-w-64 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-900 focus:border-brand-500 focus:outline-none"
      >
        <option value="">—</option>
        {filtered.map((p) => (
          <option key={p.id} value={p.id}>
            {p.brand ? `${p.brand} · ${p.name}` : p.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!productId || pending}
        className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {t("unmatchedResolve")}
      </button>
      {error ? <span className="text-xs text-red-600">{tc("error")}</span> : null}
    </form>
  );
}
