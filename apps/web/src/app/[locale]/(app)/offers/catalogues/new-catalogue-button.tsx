"use client";

import { useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createCatalogueAction } from "@/server/catalogues/actions";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";

export function NewCatalogueButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const t = useTranslations("Catalogues");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await createCatalogueAction({
      retailerSlug: String(form.get("retailer") ?? "carrefour"),
      title: String(form.get("title") ?? "") || undefined,
      validFrom: String(form.get("validFrom") ?? "") || undefined,
      validUntil: String(form.get("validUntil") ?? "") || undefined,
    });
    setPending(false);
    if (result.ok && result.catalogueId) {
      setOpen(false);
      router.push(`/offers/catalogues/${result.catalogueId}`);
      router.refresh();
    } else {
      setError(t("confirmFailed"));
    }
  }

  return (
    <>
      <button type="button" className={variant === "primary" ? "btn-primary" : "btn-secondary"} onClick={() => setOpen(true)}>
        <PlusIcon size={16} aria-hidden />
        {t("addCatalogue")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button type="button" aria-label={t("addCatalogue")} className="backdrop-fade absolute inset-0 bg-zinc-900/40" onClick={() => setOpen(false)} />
          <div className="sheet-panel relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <h2 className="text-lg font-bold text-zinc-900">{t("addCatalogue")}</h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="cat-retailer">{t("retailerTitle")}</label>
                  <select id="cat-retailer" name="retailer" defaultValue="carrefour">
                    {["carrefour", "intermarche", "lidl", "leclerc", "monoprix", "franprix", "g20", "independent"].map((slug) => (
                      <option key={slug} value={slug}>
                        {slug}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cat-title">{t("titleOptional")}</label>
                  <input id="cat-title" name="title" placeholder="Promos de la semaine" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="cat-from">{t("validFromLabel")}</label>
                  <input id="cat-from" name="validFrom" type="date" />
                </div>
                <div>
                  <label htmlFor="cat-until">{t("validUntilLabel")}</label>
                  <input id="cat-until" name="validUntil" type="date" />
                </div>
              </div>
              {error ? <p className="field-error">{error}</p> : null}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  ×
                </button>
                <button type="submit" className="btn-primary" disabled={pending}>
                  {pending ? "…" : t("createCatalogueBtn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
