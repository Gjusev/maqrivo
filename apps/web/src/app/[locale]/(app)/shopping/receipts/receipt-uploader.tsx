"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { CameraIcon } from "@phosphor-icons/react/dist/csr/Camera";

interface StoreOption {
  id: string;
  name: string;
}

/** Receipt upload: photo (camera) + store + purchase date. */
export function ReceiptUploader() {
  const t = useTranslations("Receipts");
  const ts = useTranslations("Stores");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/my-stores")
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((d: { stores: StoreOption[] }) => {
        setStores(d.stores ?? []);
        setLoaded(true);
      });
  }, []);

  async function upload(file: File | null) {
    if (!file || pending || stores.length === 0) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.append("photo", file);
    form.append("storeId", storeId ?? stores[0]!.id);
    form.append("purchasedOn", date);
    const res = await fetch("/api/receipts", { method: "POST", body: form });
    setPending(false);
    if (inputRef.current) inputRef.current.value = "";
    if (res.ok) {
      const data = (await res.json()) as { receiptId: string };
      router.push(`/shopping/receipts/${data.receiptId}`);
      router.refresh();
    } else {
      setError(t("extractFailed"));
    }
  }

  if (!loaded) return null;

  if (stores.length === 0) {
    return (
      <div className="card p-4">
        <p className="text-sm text-zinc-500">{t("needStores")}</p>
        <Link href="/stores" className="btn-secondary mt-3">
          {ts("title")}
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-zinc-900">{t("add")}</h2>
      <p className="mt-0.5 text-xs text-zinc-400">{t("uploadHint")}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="receipt-store">{t("store")}</label>
          <select
            id="receipt-store"
            name="store"
            value={storeId ?? stores[0]!.id}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="receipt-date">{t("date")}</label>
          <input
            id="receipt-date"
            type="date"
            className="min-h-11 py-1"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          <CameraIcon size={16} aria-hidden />
          {pending ? t("uploading") : t("upload")}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => void upload(e.target.files?.[0] ?? null)}
      />
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
