"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createProductAction } from "@/server/products/actions";
import { PageHeader } from "@/components/page-header";

interface ConceptOption {
  id: string;
  nameFr: string;
  nameEn: string;
}

export default function NewProductPage() {
  const t = useTranslations("Products");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();

  const [mode, setMode] = useState<"PACKAGED" | "WEIGHT" | "UNIT">("PACKAGED");
  const [halalState, setHalalState] = useState<"CONFIRMED" | "CLAIMED" | "UNKNOWN" | "NOT_HALAL">("UNKNOWN");
  const [conceptQuery, setConceptQuery] = useState("");
  const [concepts, setConcepts] = useState<ConceptOption[]>([]);
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [conceptName, setConceptName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (conceptQuery.trim().length < 2) {
        setConcepts([]);
        return;
      }
      void fetch(`/api/concepts?q=${encodeURIComponent(conceptQuery)}`)
        .then((r) => (r.ok ? r.json() : { concepts: [] }))
        .then((d: { concepts: ConceptOption[] }) => setConcepts(d.concepts ?? []));
    }, 250);
    return () => clearTimeout(timer);
  }, [conceptQuery]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const num = (name: string) => {
      const raw = String(form.get(name) ?? "").replace(",", ".").trim();
      if (raw === "") return undefined;
      const v = Number(raw);
      return Number.isFinite(v) && v >= 0 ? v : undefined;
    };
    setPending(true);
    setError(null);
    const result = await createProductAction({
      name: String(form.get("name") ?? ""),
      brand: String(form.get("brand") ?? "") || undefined,
      barcode: String(form.get("barcode") ?? "") || undefined,
      purchasingMode: mode,
      packageQuantity: mode === "PACKAGED" ? num("packageQuantity") : undefined,
      packageUnit: mode === "PACKAGED" ? "g" : undefined,
      halalState,
      ingredients: String(form.get("ingredients") ?? "") || undefined,
      notes: String(form.get("notes") ?? "") || undefined,
      foodConceptId: conceptId ?? undefined,
      nutrition:
        num("kcal") !== undefined ||
        num("protein") !== undefined ||
        num("carbs") !== undefined ||
        num("fat") !== undefined
          ? {
              basis: "100g",
              energyKcal: num("kcal"),
              proteinG: num("protein"),
              carbohydrateG: num("carbs"),
              fatG: num("fat"),
            }
          : undefined,
    });
    setPending(false);
    if (result.ok && result.data) {
      router.push(`/products/${result.data.id}`);
      router.refresh();
    } else {
      setError(tc("error"));
    }
  }

  return (
    <>
      <PageHeader title={t("createManually")} />
      <form onSubmit={handleSubmit} className="card space-y-4 p-5">
        <div>
          <label htmlFor="name">{t("nameLabel")}</label>
          <input id="name" name="name" required minLength={2} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="brand">{t("brand")}</label>
            <input id="brand" name="brand" />
          </div>
          <div>
            <label htmlFor="barcode">{t("barcode")}</label>
            <input id="barcode" name="barcode" inputMode="numeric" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="mode">{t("packageSize")}</label>
            <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="PACKAGED">pack</option>
              <option value="WEIGHT">{t("soldByWeight")}</option>
              <option value="UNIT">{tc("perUnit")}</option>
            </select>
          </div>
          {mode === "PACKAGED" ? (
            <div>
              <label htmlFor="packageQuantity">{t("unit")} (g)</label>
              <input id="packageQuantity" name="packageQuantity" inputMode="decimal" placeholder="600" />
            </div>
          ) : null}
        </div>

        <div>
          <label htmlFor="concept">{t("linkConcept")}</label>
          {conceptName ? (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3">
              <span className="text-sm text-brand-800">{conceptName}</span>
              <button
                type="button"
                className="btn-ghost px-2 text-xs"
                onClick={() => {
                  setConceptId(null);
                  setConceptName(null);
                }}
              >
                {tc("delete")}
              </button>
            </div>
          ) : (
            <>
              <input
                id="concept"
                value={conceptQuery}
                onChange={(e) => setConceptQuery(e.target.value)}
                placeholder={t("searchConcept")}
                autoComplete="off"
              />
              {concepts.length > 0 ? (
                <ul className="mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                  {concepts.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                        onClick={() => {
                          setConceptId(c.id);
                          setConceptName(locale === "fr" ? c.nameFr : c.nameEn);
                          setConceptQuery("");
                          setConcepts([]);
                        }}
                      >
                        {locale === "fr" ? c.nameFr : c.nameEn}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-zinc-700">halal</legend>
          <div className="flex flex-wrap gap-2">
            {(["CONFIRMED", "CLAIMED", "UNKNOWN", "NOT_HALAL"] as const).map((state) => (
              <button
                key={state}
                type="button"
                aria-pressed={halalState === state}
                className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
                  halalState === state
                    ? "border-brand-300 bg-brand-50 text-brand-800"
                    : "border-zinc-300 bg-white text-zinc-600"
                }`}
                onClick={() => setHalalState(state)}
              >
                {state}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-zinc-200 p-3">
          <legend className="px-1 text-sm font-medium text-zinc-700">{t("per100g")}</legend>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label htmlFor="kcal">{t("kcal")}</label>
              <input id="kcal" name="kcal" inputMode="decimal" />
            </div>
            <div>
              <label htmlFor="protein">{t("proteinShort")}</label>
              <input id="protein" name="protein" inputMode="decimal" />
            </div>
            <div>
              <label htmlFor="carbs">{t("carbsShort")}</label>
              <input id="carbs" name="carbs" inputMode="decimal" />
            </div>
            <div>
              <label htmlFor="fat">{t("fatShort")}</label>
              <input id="fat" name="fat" inputMode="decimal" />
            </div>
          </div>
        </fieldset>

        <div>
          <label htmlFor="ingredients">{t("ingredients")}</label>
          <textarea id="ingredients" name="ingredients" rows={2} />
        </div>
        <div>
          <label htmlFor="notes">{t("notes")}</label>
          <textarea id="notes" name="notes" rows={2} />
        </div>

        {error ? <p className="field-error">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => router.push("/products")}>
            {tc("cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? tc("loading") : tc("save")}
          </button>
        </div>
      </form>
    </>
  );
}
