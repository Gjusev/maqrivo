"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { normalizeName } from "@maqrivo/core";
import { StoreCard } from "./store-card";

/** How many nearest stores render before the user searches. */
const COLLAPSED_LIMIT = 40;

export interface NearbyStoreItem {
  storeId: string;
  name: string;
  retailer: string | null;
  format: string | null;
  origin: string;
  tags: string[];
  distanceLabel: string | null;
  enabled: boolean;
  favorite: boolean;
  avoided: boolean;
}

/**
 * Nearby stores with client-side search. Discovery can surface hundreds of
 * shops around a dense area (La Défense: 180+); without search, anything
 * beyond the nearest slice is effectively unreachable from the UI.
 */
export function NearbyStores({ stores }: { stores: NearbyStoreItem[] }) {
  const t = useTranslations("Stores");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return stores.slice(0, COLLAPSED_LIMIT);
    return stores.filter((s) => normalizeName(s.name).includes(q) || (s.retailer && normalizeName(s.retailer).includes(q)));
  }, [stores, query]);

  const searching = normalizeName(query).length > 0;
  const hidden = searching ? 0 : stores.length - Math.min(stores.length, COLLAPSED_LIMIT);

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
          placeholder={t("searchStores")}
          autoComplete="off"
          className="pl-9"
          aria-label={t("searchStores")}
        />
      </div>
      <ul className="space-y-2">
        {filtered.map((s) => (
          <StoreCard key={s.storeId} {...s} />
        ))}
      </ul>
      {filtered.length === 0 ? (
        <p className="py-2 text-sm text-zinc-400">{t("noStoreMatches")}</p>
      ) : null}
      {hidden > 0 ? (
        <p className="mt-2 text-xs text-zinc-400">{t("moreStores", { count: hidden })}</p>
      ) : null}
    </div>
  );
}
