"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { OffersScope } from "@/server/ingestion/offers-scope";

/** "My stores" / "All" chips — the offers page's scope lives in ?scope=. */
export function FilterBar({ scope }: { scope: OffersScope }) {
  const t = useTranslations("Offers");
  const router = useRouter();

  const chips: { key: OffersScope; label: string; href: string }[] = [
    { key: "enabled-stores", label: t("scopeMine"), href: "/offers" },
    { key: "all", label: t("scopeAll"), href: "/offers?scope=all" },
  ];

  return (
    <div className="mb-4 flex items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => router.push(chip.href)}
          aria-pressed={scope === chip.key}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            scope === chip.key
              ? "border-brand-600 bg-brand-50 text-brand-700"
              : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
