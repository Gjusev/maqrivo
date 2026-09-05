"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { saveRecipeAction } from "@/server/recipes/actions";

interface ConceptOption {
  id: string;
  nameFr: string;
  nameEn: string;
}

interface IngredientRow {
  key: number;
  conceptId: string | null;
  conceptName: string | null;
  quantity: string;
  unit: "g" | "kg" | "ml" | "l" | "unit" | "pack";
}

export interface RecipeEditorInitial {
  id?: string;
  nameFr?: string | null;
  nameEn?: string | null;
  servings?: number;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  mealTypes?: string[];
  tags?: string[];
  instructions?: string[];
  ingredients?: { conceptId: string; conceptNameFr: string; conceptNameEn: string; quantity: number; unit: string }[];
}

export function RecipeEditor({ initial }: { initial?: RecipeEditorInitial }) {
  const t = useTranslations("Recipes");
  const tm = useTranslations("Meals");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();

  const [ingredients, setIngredients] = useState<IngredientRow[]>(() => {
    const source = initial?.ingredients ?? [];
    if (source.length > 0) {
      return source.map((ing, i) => ({
        key: i,
        conceptId: ing.conceptId,
        conceptName: locale === "fr" ? ing.conceptNameFr : ing.conceptNameEn,
        quantity: String(ing.quantity),
        unit: (ing.unit as IngredientRow["unit"]) ?? "g",
      }));
    }
    return [{ key: 0, conceptId: null, conceptName: null, quantity: "", unit: "g" }];
  });
  const [steps, setSteps] = useState<string[]>(initial?.instructions?.length ? initial.instructions : [""]);
  const [mealTypes, setMealTypes] = useState<string[]>(initial?.mealTypes ?? ["dinner"]);
  const [search, setSearch] = useState<{ key: number; q: string } | null>(null);
  const [hits, setHits] = useState<ConceptOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!search || search.q.trim().length < 2) {
        setHits([]);
        return;
      }
      void fetch(`/api/concepts?q=${encodeURIComponent(search.q)}`)
        .then((r) => (r.ok ? r.json() : { concepts: [] }))
        .then((d: { concepts: ConceptOption[] }) => setHits(d.concepts ?? []));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const validIngredients = ingredients
      .filter((i) => i.conceptId && Number(i.quantity.replace(",", ".")) > 0)
      .map((i) => ({
        foodConceptId: i.conceptId!,
        quantity: Number(i.quantity.replace(",", ".")),
        unit: i.unit,
      }));
    if (validIngredients.length === 0) {
      setError(t("addIngredient"));
      return;
    }
    setPending(true);
    setError(null);
    const result = await saveRecipeAction({
      id: initial?.id,
      nameFr: String(form.get("nameFr") ?? "") || undefined,
      nameEn: String(form.get("nameEn") ?? "") || undefined,
      servings: Number(form.get("servings") ?? 2) || 2,
      prepMinutes: form.get("prep") ? Number(form.get("prep")) : undefined,
      cookMinutes: form.get("cook") ? Number(form.get("cook")) : undefined,
      mealTypes: mealTypes as ("breakfast" | "lunch" | "dinner" | "snack")[],
      tags: String(form.get("tags") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10),
      instructions: steps.map((s) => s.trim()).filter(Boolean),
      ingredients: validIngredients,
    });
    setPending(false);
    if (result.ok && result.data) {
      router.push(`/recipes/${result.data.id}`);
      router.refresh();
    } else {
      setError(tc("error"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nameFr">{t("nameFr")}</label>
          <input id="nameFr" name="nameFr" defaultValue={initial?.nameFr ?? ""} />
        </div>
        <div>
          <label htmlFor="nameEn">{t("nameEn")}</label>
          <input id="nameEn" name="nameEn" defaultValue={initial?.nameEn ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="servings">{t("servings")}</label>
          <input id="servings" name="servings" type="number" min={1} max={20} defaultValue={initial?.servings ?? 2} />
        </div>
        <div>
          <label htmlFor="prep">{tm("prepTime")} (min)</label>
          <input id="prep" name="prep" type="number" min={0} max={600} defaultValue={initial?.prepMinutes ?? ""} />
        </div>
        <div>
          <label htmlFor="cook">{tm("cookTime")} (min)</label>
          <input id="cook" name="cook" type="number" min={0} max={600} defaultValue={initial?.cookMinutes ?? ""} />
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-zinc-700">{t("mealType")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["breakfast", "lunch", "dinner", "snack"] as const).map((type) => {
            const active = mealTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
                  active ? "border-brand-300 bg-brand-50 text-brand-800" : "border-zinc-300 bg-white text-zinc-600"
                }`}
                onClick={() => setMealTypes(active ? mealTypes.filter((m) => m !== type) : [...mealTypes, type])}
              >
                {tm(type)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="tags">{t("tags")}</label>
        <input id="tags" name="tags" defaultValue={initial?.tags?.join(", ") ?? ""} placeholder="high-protein, quick" />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-zinc-700">{t("ingredients")}</legend>
        <ul className="space-y-2">
          {ingredients.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                {row.conceptId ? (
                  <div className="flex items-center justify-between rounded-lg border border-zinc-300 bg-white px-3">
                    <span className="truncate text-sm text-zinc-800">{row.conceptName}</span>
                    <button
                      type="button"
                      className="btn-ghost px-2 text-xs text-zinc-400"
                      onClick={() =>
                        setIngredients((rows) => rows.map((r) => (r.key === row.key ? { ...r, conceptId: null, conceptName: null } : r)))
                      }
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <input
                    placeholder={t("ingredient")}
                    value={search?.key === row.key ? search.q : ""}
                    onChange={(e) => setSearch({ key: row.key, q: e.target.value })}
                    autoComplete="off"
                  />
                )}
                {search?.key === row.key && hits.length > 0 && !row.conceptId ? (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-md">
                    {hits.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                          onClick={() => {
                            setIngredients((rows) =>
                              rows.map((r) => (r.key === row.key ? { ...r, conceptId: c.id, conceptName: locale === "fr" ? c.nameFr : c.nameEn } : r)),
                            );
                            setSearch(null);
                          }}
                        >
                          {locale === "fr" ? c.nameFr : c.nameEn}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <input
                className="w-24"
                inputMode="decimal"
                placeholder="150"
                value={row.quantity}
                onChange={(e) =>
                  setIngredients((rows) => rows.map((r) => (r.key === row.key ? { ...r, quantity: e.target.value } : r)))
                }
                aria-label={t("amount")}
              />
              <select
                className="w-20"
                value={row.unit}
                onChange={(e) =>
                  setIngredients((rows) => rows.map((r) => (r.key === row.key ? { ...r, unit: e.target.value as IngredientRow["unit"] } : r)))
                }
                aria-label="unit"
              >
                {(["g", "kg", "ml", "l", "unit", "pack"] as const).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {ingredients.length > 1 ? (
                <button
                  type="button"
                  className="btn-ghost px-2 text-zinc-400"
                  aria-label="remove"
                  onClick={() => setIngredients((rows) => rows.filter((r) => r.key !== row.key))}
                >
                  <span aria-hidden>×</span>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-ghost mt-2 text-xs"
          onClick={() =>
            setIngredients((rows) => [...rows, { key: Math.max(...rows.map((r) => r.key)) + 1, conceptId: null, conceptName: null, quantity: "", unit: "g" }])
          }
        >
          + {t("addIngredient")}
        </button>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-zinc-700">{t("instructions")}</legend>
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-center text-xs font-medium text-zinc-400">{i + 1}</span>
              <input
                value={step}
                onChange={(e) => setSteps((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={t("step", { n: i + 1 })}
              />
            </li>
          ))}
        </ol>
        <button type="button" className="btn-ghost mt-2 text-xs" onClick={() => setSteps((s) => [...s, ""])}>
          + {t("addStep")}
        </button>
      </fieldset>

      {error ? <p className="field-error">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => router.push("/recipes")}>
          {tc("cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? tc("loading") : tc("save")}
        </button>
      </div>
    </form>
  );
}
