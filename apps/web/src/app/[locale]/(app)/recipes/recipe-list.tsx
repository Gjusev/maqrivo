"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { normalizeName } from "@maqrivo/core";
import { Link } from "@/i18n/navigation";
import { RecipeActions } from "./recipe-actions";

export interface RecipeListItem {
  id: string;
  name: string;
  sub: string;
  favorite: boolean;
  own: boolean;
}

/**
 * Recipe list with client-side search — favorites stay pinned on top, the
 * search box reaches the rest without a round trip.
 */
export function RecipeList({ items, total }: { items: RecipeListItem[]; total: number }) {
  const t = useTranslations("Recipes");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return items;
    return items.filter((r) => normalizeName(r.name).includes(q));
  }, [items, query]);

  return (
    <div>
      <div className="relative mb-3">
        <MagnifyingGlassIcon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          className="pl-9"
          aria-label={t("searchPlaceholder")}
        />
      </div>
      <ul className="space-y-2">
        {filtered.map((r) => (
          <li key={r.id} className="card flex items-center gap-3 p-3.5">
            <Link href={`/recipes/${r.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-900">{r.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{r.sub}</p>
            </Link>
            <RecipeActions recipeId={r.id} favorite={r.favorite} own={r.own} />
          </li>
        ))}
      </ul>
      {filtered.length < total ? (
        <p className="mt-2 text-xs text-zinc-400">{t("showingOf", { shown: filtered.length, total })}</p>
      ) : null}
    </div>
  );
}
