"use client";

import { useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Dialog } from "@/components/dialog";
import { createCatalogueAction } from "@/server/catalogues/actions";
import { CATALOGUE_RETAILERS } from "@/lib/retailers";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";

export function NewCatalogueButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const t = useTranslations("Catalogues");
  const router = useRouter();
  const tc = useTranslations("Common");
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

      <Dialog open={open} onClose={() => setOpen(false)} closeLabel={tc("close")} labelledBy="new-catalogue-title">
        <h2 id="new-catalogue-title" className="text-lg font-bold text-zinc-900">{t("addCatalogue")}</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cat-retailer">{t("retailerTitle")}</label>
              <select id="cat-retailer" name="retailer" defaultValue="carrefour">
                {CATALOGUE_RETAILERS.map((retailer) => (
                  <option key={retailer.slug} value={retailer.slug}>
                    {retailer.label} · {t(retailer.source === "auto" ? "sourceAuto" : "sourcePhoto")}
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
            <button type="button" className="btn-secondary" aria-label={tc("close")} onClick={() => setOpen(false)}>
              ×
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "…" : t("createCatalogueBtn")}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
