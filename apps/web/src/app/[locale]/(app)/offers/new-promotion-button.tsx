"use client";

import { useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createManualPromotionAction } from "@/server/ingestion/promotion-actions";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";

const MECHANISMS = [
  "PROMO_PRICE",
  "PERCENTAGE_OFF",
  "MULTIBUY",
  "BUY_X_GET_Y",
  "SECOND_UNIT_DISCOUNT",
  "LOYALTY_PRICE",
] as const;

export function NewPromotionButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const t = useTranslations("Offers");
  const tc = useTranslations("Common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mechanism, setMechanism] = useState<(typeof MECHANISMS)[number]>("PROMO_PRICE");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const euros = (name: string) => {
      const raw = String(form.get(name) ?? "").replace(",", ".").trim();
      if (raw === "") return undefined;
      const v = Number(raw);
      return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : undefined;
    };
    const int = (name: string) => {
      const raw = String(form.get(name) ?? "").trim();
      if (raw === "") return undefined;
      const v = Number(raw);
      return Number.isInteger(v) && v > 0 ? v : undefined;
    };
    setPending(true);
    setError(null);
    const result = await createManualPromotionAction({
      retailerSlug: String(form.get("retailer") ?? "carrefour"),
      description: String(form.get("description") ?? ""),
      brand: String(form.get("brand") ?? "") || undefined,
      regularPriceCents: euros("regular"),
      mechanism,
      promoPriceCents: euros("promoPrice"),
      bundleQty: mechanism === "MULTIBUY" ? int("bundleQty") : undefined,
      buyQty: mechanism === "BUY_X_GET_Y" ? int("buyQty") : undefined,
      freeQty: mechanism === "BUY_X_GET_Y" ? int("freeQty") : undefined,
      discountPct:
        mechanism === "PERCENTAGE_OFF" || mechanism === "SECOND_UNIT_DISCOUNT" ? int("discountPct") : undefined,
      loyaltyRequired: mechanism === "LOYALTY_PRICE",
      validUntil: String(form.get("validUntil") ?? ""),
    });
    setPending(false);
    if (result.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(tc("error"));
    }
  }

  return (
    <>
      <button type="button" className={variant === "primary" ? "btn-primary" : "btn-secondary"} onClick={() => setOpen(true)}>
        <PlusIcon size={16} aria-hidden />
        {t("addPromo")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button type="button" aria-label={tc("close")} className="backdrop-fade absolute inset-0 bg-zinc-900/40" onClick={() => setOpen(false)} />
          <div className="sheet-panel relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <h2 className="text-lg font-bold text-zinc-900">{t("addPromo")}</h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="retailer">{t("retailer")}</label>
                  <select id="retailer" name="retailer" defaultValue="carrefour">
                    {["carrefour", "intermarche", "lidl", "leclerc", "monoprix", "franprix", "g20", "independent"].map((slug) => (
                      <option key={slug} value={slug}>
                        {slug}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="mechanism">{t("mechanism")}</label>
                  <select id="mechanism" value={mechanism} onChange={(e) => setMechanism(e.target.value as (typeof MECHANISMS)[number])}>
                    {MECHANISMS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="description">{t("description")}</label>
                <input id="description" name="description" required placeholder="Filets de poulet 600 g" />
              </div>
              <div>
                <label htmlFor="brand">{t("brandLabel")}</label>
                <input id="brand" name="brand" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {mechanism === "PROMO_PRICE" || mechanism === "LOYALTY_PRICE" ? (
                  <div>
                    <label htmlFor="promoPrice">{t("promoPriceLabel")}</label>
                    <input id="promoPrice" name="promoPrice" inputMode="decimal" placeholder="4,99" />
                  </div>
                ) : null}
                {mechanism === "PERCENTAGE_OFF" || mechanism === "SECOND_UNIT_DISCOUNT" ? (
                  <div>
                    <label htmlFor="discountPct">{t("discountPctLabel")}</label>
                    <input id="discountPct" name="discountPct" inputMode="numeric" placeholder="30" />
                  </div>
                ) : null}
                {mechanism === "MULTIBUY" ? (
                  <>
                    <div>
                      <label htmlFor="bundleQty">{t("bundleQtyLabel")}</label>
                      <input id="bundleQty" name="bundleQty" inputMode="numeric" placeholder="2" />
                    </div>
                    <div>
                      <label htmlFor="promoPrice">{t("bundlePriceLabel")}</label>
                      <input id="promoPrice" name="promoPrice" inputMode="decimal" placeholder="5,00" />
                    </div>
                  </>
                ) : null}
                {mechanism === "BUY_X_GET_Y" ? (
                  <>
                    <div>
                      <label htmlFor="buyQty">{t("bundleQtyLabel")}</label>
                      <input id="buyQty" name="buyQty" inputMode="numeric" placeholder="2" />
                    </div>
                    <div>
                      <label htmlFor="freeQty">{t("freeItem", { n: "3" })}</label>
                      <input id="freeQty" name="freeQty" inputMode="numeric" placeholder="1" />
                    </div>
                  </>
                ) : null}
                <div>
                  <label htmlFor="regular">{t("regularPrice")}</label>
                  <input id="regular" name="regular" inputMode="decimal" placeholder="6,49" />
                </div>
              </div>

              <div>
                <label htmlFor="validUntil">{t("validUntilLabel")}</label>
                <input id="validUntil" name="validUntil" type="date" required />
              </div>

              {error ? <p className="field-error">{error}</p> : null}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  {tc("cancel")}
                </button>
                <button type="submit" className="btn-primary" disabled={pending}>
                  {t("savePromo")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
