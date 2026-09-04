"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setProductConceptAction } from "@/server/products/actions";

interface ConceptOption {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  category: string;
}

export function ConceptLinker({
  productId,
  currentConceptId,
  currentConceptName,
}: {
  productId: string;
  currentConceptId: string | null;
  currentConceptName: string | null;
}) {
  const t = useTranslations("Products");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ConceptOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!open || query.trim().length < 2) {
        setOptions([]);
        return;
      }
      void fetch(`/api/concepts?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : { concepts: [] }))
        .then((d: { concepts: ConceptOption[] }) => setOptions(d.concepts ?? []));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  async function link(conceptId: string | null) {
    await setProductConceptAction(productId, conceptId);
    setOpen(false);
    setQuery("");
    router.refresh();
  }

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{t("linkConcept")}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{currentConceptName ?? t("noConcept")}</p>
        </div>
        <button type="button" className="btn-secondary px-3 text-xs" onClick={() => setOpen((v) => !v)}>
          {t("changeConcept")}
        </button>
      </div>
      {open ? (
        <div className="mt-3 space-y-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchConcept")}
            autoComplete="off"
          />
          {options.length > 0 ? (
            <ul className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              {options.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    onClick={() => void link(c.id)}
                  >
                    {locale === "fr" ? c.nameFr : c.nameEn}
                    <span className="ml-1.5 text-xs text-zinc-400">{c.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {currentConceptId ? (
            <button type="button" className="btn-ghost text-xs text-zinc-500" onClick={() => void link(null)}>
              {t("noConcept")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
