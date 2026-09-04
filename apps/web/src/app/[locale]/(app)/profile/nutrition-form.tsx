"use client";

import { useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { saveNutritionProfileAction } from "@/server/profile/actions";

export interface NutritionFormInitial {
  dailyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  mealsPerDay: number;
  weeklyBudgetEuros: number | null;
  halalRequired: boolean;
  allowUnknownHalal: boolean;
  vegetarian: boolean;
  vegan: boolean;
  allergens: string[];
}

export function NutritionForm({ initial }: { initial: NutritionFormInitial }) {
  const t = useTranslations("Profile");
  const tc = useTranslations("Common");
  const router = useRouter();
  const [halalRequired, setHalalRequired] = useState(initial.halalRequired);
  const [allowUnknown, setAllowUnknown] = useState(initial.allowUnknownHalal);
  const [vegetarian, setVegetarian] = useState(initial.vegetarian);
  const [vegan, setVegan] = useState(initial.vegan);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    setSaved(false);
    setError(null);
    const result = await saveNutritionProfileAction({
      dailyKcal: num("kcal"),
      proteinG: num("protein"),
      carbohydrateG: num("carbs"),
      fatG: num("fat"),
      fiberG: num("fiber"),
      mealsPerDay: num("meals") ?? 3,
      weeklyBudgetEuros: num("budget"),
      halalRequired,
      allowUnknownHalal: allowUnknown,
      vegetarian,
      vegan,
      allergens: String(form.get("allergens") ?? "")
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
    });
    setPending(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(tc("error"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="kcal">{t("dailyCalories")}</label>
          <input id="kcal" name="kcal" inputMode="numeric" defaultValue={initial.dailyKcal ?? ""} placeholder="2500" />
        </div>
        <div>
          <label htmlFor="protein">{t("dailyProtein")}</label>
          <input id="protein" name="protein" inputMode="numeric" defaultValue={initial.proteinG ?? ""} placeholder="170" />
        </div>
        <div>
          <label htmlFor="carbs">{t("dailyCarbs")}</label>
          <input id="carbs" name="carbs" inputMode="numeric" defaultValue={initial.carbohydrateG ?? ""} placeholder="260" />
        </div>
        <div>
          <label htmlFor="fat">{t("dailyFat")}</label>
          <input id="fat" name="fat" inputMode="numeric" defaultValue={initial.fatG ?? ""} placeholder="80" />
        </div>
        <div>
          <label htmlFor="fiber">{t("dailyFiber")}</label>
          <input id="fiber" name="fiber" inputMode="numeric" defaultValue={initial.fiberG ?? ""} placeholder="30" />
        </div>
        <div>
          <label htmlFor="meals">{t("mealsPerDay")}</label>
          <input id="meals" name="meals" type="number" min={1} max={6} defaultValue={initial.mealsPerDay} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="budget">{t("weeklyBudget")} (€)</label>
          <input id="budget" name="budget" inputMode="decimal" defaultValue={initial.weeklyBudgetEuros ?? ""} placeholder="80" />
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-zinc-700">{t("dietary")}</legend>
        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={halalRequired}
              onChange={(e) => setHalalRequired(e.target.checked)}
              className="size-5 min-h-0"
            />
            {t("halalRequired")}
          </label>
          <label className={`flex min-h-11 items-center gap-3 text-sm ${halalRequired ? "text-zinc-700" : "text-zinc-400"}`}>
            <input
              type="checkbox"
              checked={allowUnknown}
              disabled={!halalRequired}
              onChange={(e) => setAllowUnknown(e.target.checked)}
              className="size-5 min-h-0"
            />
            {t("allowUnknownHalal")}
          </label>
          <div className="flex gap-6">
            <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={vegetarian}
                onChange={(e) => setVegetarian(e.target.checked)}
                className="size-5 min-h-0"
              />
              {t("vegetarian")}
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
              <input type="checkbox" checked={vegan} onChange={(e) => setVegan(e.target.checked)} className="size-5 min-h-0" />
              {t("vegan")}
            </label>
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="allergens">{t("allergens")}</label>
        <input id="allergens" name="allergens" defaultValue={initial.allergens.join(", ")} placeholder="lactose, fruits à coque" />
      </div>

      {error ? <p className="field-error">{error}</p> : null}
      {saved ? <p className="text-sm font-medium text-brand-700">{t("saved")}</p> : null}

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? tc("loading") : tc("save")}
        </button>
      </div>
    </form>
  );
}
