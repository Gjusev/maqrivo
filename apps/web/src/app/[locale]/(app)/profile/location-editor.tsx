"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setLocationAction } from "@/server/stores/actions";

interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
}

export function LocationEditor({
  currentLabel,
  currentLat,
  currentLng,
}: {
  currentLabel: string | null;
  currentLat: number | null;
  currentLng: number | null;
}) {
  const t = useTranslations("Profile");
  const tc = useTranslations("Common");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [selected, setSelected] = useState<GeocodeHit | null>(
    currentLat != null && currentLng != null && currentLabel
      ? { label: currentLabel, lat: currentLat, lng: currentLng }
      : null,
  );
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function search(q: string) {
    setQuery(q);
    setSaved(false);
    if (q.trim().length < 3) {
      setHits([]);
      return;
    }
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { results: GeocodeHit[] };
    setHits(data.results ?? []);
  }

  async function save() {
    if (!selected) return;
    setPending(true);
    const result = await setLocationAction({ label: selected.label, lat: selected.lat, lng: selected.lng });
    setPending(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-zinc-900">{t("location")}</h2>
      <p className="mt-1 text-sm text-zinc-500">{t("locationHint")}</p>
      <div className="mt-3 space-y-2">
        <input
          aria-label={t("location")}
          value={query}
          onChange={(e) => void search(e.target.value)}
          placeholder={t("locationLabel")}
          autoComplete="off"
        />
        {hits.length > 0 ? (
          <ul className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {hits.map((hit) => (
              <li key={`${hit.lat},${hit.lng}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  onClick={() => {
                    setSelected(hit);
                    setQuery(hit.label);
                    setHits([]);
                    setSaved(false);
                  }}
                >
                  {hit.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {selected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              {selected.label} · {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
            </p>
            <button type="button" className="btn-secondary px-3 text-xs" onClick={() => void save()} disabled={pending}>
              {pending ? tc("loading") : tc("save")}
            </button>
          </div>
        ) : null}
        {saved ? <p className="text-xs text-brand-700">{t("saved")}</p> : null}
      </div>
    </section>
  );
}
