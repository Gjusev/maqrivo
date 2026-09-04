"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addPriceObservationAction } from "@/server/products/actions";

interface StoreOption {
  id: string;
  name: string;
}

export function AddPriceForm({ productId }: { productId: string }) {
  const t = useTranslations("Products");
  const tc = useTranslations("Common");
  const router = useRouter();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [basis, setBasis] = useState<"unit" | "per_kg">("unit");
  const [discounted, setDiscounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Enabled + custom stores of this user, proxied through a server route.
    void fetch("/api/my-stores")
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((d: { stores: StoreOption[] }) => setStores(d.stores ?? []));
  }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const euros = Number(String(form.get("amount") ?? "").replace(",", "."));
    if (!(euros > 0)) {
      setError(tc("error"));
      return;
    }
    setPending(true);
    setError(null);
    const result = await addPriceObservationAction({
      productId,
      storeId: String(form.get("storeId") ?? ""),
      amountCents: Math.round(euros * 100),
      priceBasis: basis,
      discounted,
      regularAmountCents:
        form.get("regular") !== null && String(form.get("regular") ?? "") !== ""
          ? Math.round(Number(String(form.get("regular")).replace(",", ".")) * 100)
          : undefined,
    });
    setPending(false);
    if (result.ok) {
      router.refresh();
    } else {
      setError(tc("error"));
    }
  }

  if (stores.length === 0) return null;

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-zinc-900">{t("addPriceTitle")}</h2>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="storeId">{t("store")}</label>
            <select id="storeId" name="storeId" required>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="basis">{t("priceBasis")}</label>
            <select
              id="basis"
              value={basis}
              onChange={(e) => setBasis(e.target.value as "unit" | "per_kg")}
            >
              <option value="unit">{t("pricePerUnitLabel")}</option>
              <option value="per_kg">{t("pricePerKilo")}</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="amount">{t("priceAmount")}</label>
            <input id="amount" name="amount" inputMode="decimal" required placeholder="2,49" />
          </div>
          <div>
            <label htmlFor="regular">{t("regularPriceOptional")}</label>
            <input id="regular" name="regular" inputMode="decimal" placeholder="3,99" />
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={discounted}
            onChange={(e) => setDiscounted(e.target.checked)}
            className="size-4 min-h-0"
          />
          {t("discounted")}
        </label>
        {error ? <p className="field-error">{error}</p> : null}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? tc("loading") : tc("save")}
        </button>
      </form>
    </section>
  );
}
