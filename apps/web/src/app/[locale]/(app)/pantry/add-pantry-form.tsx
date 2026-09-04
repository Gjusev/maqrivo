"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addPantryItemAction } from "@/server/recipes/actions";

interface ConceptOption {
  id: string;
  nameFr: string;
  nameEn: string;
}

export function AddPantryForm() {
  const t = useTranslations("Pantry");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ConceptOption[]>([]);
  const [selected, setSelected] = useState<ConceptOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selected || query.trim().length < 2) {
        setHits([]);
        return;
      }
      void fetch(`/api/concepts?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : { concepts: [] }))
        .then((d: { concepts: ConceptOption[] }) => setHits(d.concepts ?? []));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = Number(String(form.get("quantity") ?? "").replace(",", "."));
    if ((!selected && !form.get("label")) || !(quantity > 0)) {
      setError(tc("error"));
      return;
    }
    setPending(true);
    const result = await addPantryItemAction({
      foodConceptId: selected?.id,
      label: selected ? undefined : String(form.get("label") ?? ""),
      quantity,
      unit: String(form.get("unit") ?? "g"),
      expiresOn: String(form.get("expiresOn") ?? "") || undefined,
    });
    setPending(false);
    if (result.ok) {
      setSelected(null);
      setQuery("");
      setError(null);
      window.location.reload();
    } else {
      setError(tc("error"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold text-zinc-900">{t("addItem")}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="relative col-span-2">
          <label htmlFor="concept-or-label">{selected ? selected.nameFr : t("addItem")}</label>
          {selected ? (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3">
              <span className="truncate text-sm text-brand-800">
                {locale === "fr" ? selected.nameFr : selected.nameEn}
              </span>
              <button type="button" className="btn-ghost px-2 text-xs text-zinc-400" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
          ) : (
            <input
              id="concept-or-label"
              name="label"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          )}
          {hits.length > 0 && !selected ? (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-md">
              {hits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setSelected(c)}
                  >
                    {locale === "fr" ? c.nameFr : c.nameEn}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <label htmlFor="quantity">{t("quantity")}</label>
          <input id="quantity" name="quantity" inputMode="decimal" placeholder="500" required />
        </div>
        <div>
          <label htmlFor="unit" className="invisible">unit</label>
          <select id="unit" name="unit" defaultValue="g" aria-label="unit">
            {(["g", "kg", "ml", "l", "unit", "pack"] as const).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="expiresOn">{t("expiresOn")}</label>
          <input id="expiresOn" name="expiresOn" type="date" />
        </div>
        <button type="submit" className="btn-primary ml-auto" disabled={pending}>
          {pending ? tc("loading") : tc("add")}
        </button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </form>
  );
}
