"use client";

import { useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createCustomStoreAction } from "@/server/stores/actions";
import { PageHeader } from "@/components/page-header";

interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
}

const FORMAT_OPTIONS = [
  "supermarket",
  "butcher",
  "bakery",
  "vegetables",
  "market",
  "specialty",
] as const;

const TAG_OPTIONS = ["halal", "butcher", "bakery", "vegetables", "organic", "bulk", "cheap"] as const;

export default function NewStorePage() {
  const t = useTranslations("Stores");
  const tc = useTranslations("Common");
  const router = useRouter();

  const [addressQuery, setAddressQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [position, setPosition] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function searchAddress(query: string) {
    setAddressQuery(query);
    if (query.trim().length < 3) {
      setHits([]);
      return;
    }
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { results: GeocodeHit[] };
    setHits(data.results ?? []);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!position) {
      setError(t("pickOnMap"));
      return;
    }
    const form = new FormData(event.currentTarget);
    setPending(true);
    const result = await createCustomStoreAction({
      name: String(form.get("name") ?? ""),
      format: String(form.get("format") ?? "specialty"),
      address: position.label || String(form.get("address") ?? "") || undefined,
      lat: position.lat,
      lng: position.lng,
      phone: String(form.get("phone") ?? "") || undefined,
      website: String(form.get("website") ?? "") || undefined,
      notes: String(form.get("notes") ?? "") || undefined,
      tags,
    });
    setPending(false);
    if (result.ok) {
      router.push("/stores");
      router.refresh();
    } else {
      setError(tc("error"));
    }
  }

  return (
    <>
      <PageHeader title={t("addCustom")} />
      <form onSubmit={handleSubmit} className="card space-y-4 p-5">
        <div>
          <label htmlFor="name">{t("name")}</label>
          <input id="name" name="name" required minLength={2} />
        </div>

        <div>
          <label htmlFor="format">{t("format")}</label>
          <select id="format" name="format" defaultValue="supermarket">
            {FORMAT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(`formats.${option}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="address">{t("searchAddress")}</label>
          <input
            id="address"
            value={addressQuery}
            onChange={(e) => void searchAddress(e.target.value)}
            autoComplete="off"
            placeholder={t("searchAddress")}
          />
          {hits.length > 0 && !position ? (
            <ul className="mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white">
              {hits.map((hit) => (
                <li key={`${hit.lat},${hit.lng}`}>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    onClick={() => {
                      setPosition(hit);
                      setHits([]);
                    }}
                  >
                    {hit.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {position ? (
            <p className="mt-1 text-xs text-brand-700">
              {position.label} ({position.lat.toFixed(4)}, {position.lng.toFixed(4)})
            </p>
          ) : null}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-zinc-700">{t("tags")}</legend>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map((tag) => {
              const active = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
                    active ? "border-brand-300 bg-brand-50 text-brand-800" : "border-zinc-300 bg-white text-zinc-600"
                  }`}
                  onClick={() => setTags(active ? tags.filter((x) => x !== tag) : [...tags, tag])}
                >
                  {t(tag)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone">{t("phone")}</label>
            <input id="phone" name="phone" type="tel" />
          </div>
          <div>
            <label htmlFor="website">{t("website")}</label>
            <input id="website" name="website" type="url" placeholder="https://" />
          </div>
        </div>

        <div>
          <label htmlFor="notes">{t("notes")}</label>
          <textarea id="notes" name="notes" rows={2} />
        </div>

        {error ? <p className="field-error">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => router.push("/stores")}>
            {tc("cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {t("createStore")}
          </button>
        </div>
      </form>
    </>
  );
}
