"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { PackageIcon } from "@phosphor-icons/react/dist/csr/Package";
import { normalizeName } from "@maqrivo/core";
import { Link } from "@/i18n/navigation";

export interface ProductListItem {
  id: string;
  name: string;
  sub: string;
}

/**
 * Product list with client-side search — the server renders the freshest 100,
 * the search box makes any of them reachable without a round trip.
 */
export function ProductList({ items, total }: { items: ProductListItem[]; total: number }) {
  const t = useTranslations("Products");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return items;
    return items.filter((p) => normalizeName(p.name).includes(q));
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
          placeholder={t("search")}
          autoComplete="off"
          className="pl-9"
          aria-label={t("search")}
        />
      </div>
      <ul className="space-y-2">
        {filtered.map((p) => (
          <li key={p.id}>
            <Link
              href={`/products/${p.id}`}
              className="card flex items-center gap-3 p-3.5 transition-colors hover:border-zinc-300"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                <PackageIcon size={18} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-900">{p.name}</p>
                {p.sub ? <p className="truncate text-xs text-zinc-500">{p.sub}</p> : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length < total ? (
        <p className="mt-2 text-xs text-zinc-400">{t("showingOf", { shown: filtered.length, total })}</p>
      ) : null}
    </div>
  );
}
