"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Dialog } from "@/components/dialog";
import { generateRecipeAction } from "@/server/ai/actions";
import { MagicWandIcon } from "@phosphor-icons/react/dist/csr/MagicWand";

export function GenerateRecipeButton() {
  const t = useTranslations("Assistant");
  const te = useTranslations("Meals");
  const tc = useTranslations("Common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function generate() {
    // Simple constraint parse: kcal/protein numbers from the prompt.
    const kcal = /(\d{3,4})\s*k?cal/i.exec(prompt);
    const protein = /(\d{1,3})\s*g?\s*(?:de\s+)?prot/i.exec(prompt);
    setPending(true);
    setStatus(null);
    const result = await generateRecipeAction({
      maxKcalPerServing: kcal ? Number(kcal[1]) : undefined,
      minProteinPerServing: protein ? Number(protein[1]) : undefined,
      mealType: /petit|breakfast/i.test(prompt) ? "breakfast" : /dîn|dinner/i.test(prompt) ? "dinner" : "lunch",
    });
    setPending(false);
    if (result.ok && result.recipeId) {
      router.push(`/recipes/${result.recipeId}`);
      router.refresh();
    } else if (result.rejectionReason) {
      setStatus(t("rejected") + result.rejectionReason);
    } else if (result.error === "ai-not-configured") {
      setStatus(t("notConfigured"));
    } else {
      setStatus(result.error ?? "error");
    }
  }

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        <MagicWandIcon size={16} aria-hidden />
        {te("generateWithAi")}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} closeLabel={tc("close")} labelledBy="generate-recipe-title">
        <h2 id="generate-recipe-title" className="text-lg font-bold text-zinc-900">{t("generateTitle")}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t("generateHint")}</p>
        <input
          className="mt-3"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("generatePlaceholder")}
          aria-label={t("generatePlaceholder")}
        />
        {status ? <p className="mt-2 text-sm text-amber-600">{status}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" aria-label={tc("close")} onClick={() => setOpen(false)}>
            ×
          </button>
          <button type="button" className="btn-primary" disabled={pending || prompt.length < 6} onClick={() => void generate()}>
            {pending ? t("thinking") : t("generateTitle")}
          </button>
        </div>
      </Dialog>
    </>
  );
}
