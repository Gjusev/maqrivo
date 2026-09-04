"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setUserLocale } from "./actions";

export function LocaleSwitcher({ current }: { current: string }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("Common");
  const [pending, startTransition] = useTransition();

  async function switchTo(next: "fr" | "en") {
    if (next === locale) return;
    await setUserLocale(next);
    startTransition(() => {
      router.replace("/", { locale: next });
      router.refresh();
    });
  }

  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-zinc-300" role="group" aria-label={t("language")}>
      {(["fr", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={pending || option === current}
          onClick={() => void switchTo(option)}
          aria-pressed={option === current}
          className={`min-h-11 px-5 text-sm font-semibold uppercase transition-colors ${
            option === current ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
