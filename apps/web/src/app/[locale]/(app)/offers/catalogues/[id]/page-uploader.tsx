"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CameraIcon } from "@phosphor-icons/react/dist/csr/Camera";

/** Multi-page photo upload (paper leaflet or screenshots). */
export function PageUploader({ catalogueId }: { catalogueId: string }) {
  const t = useTranslations("Catalogues");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || pending) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    for (const file of Array.from(files).slice(0, 10)) form.append("pages", file);
    const res = await fetch(`/api/catalogues/${catalogueId}/pages`, { method: "POST", body: form });
    setPending(false);
    if (inputRef.current) inputRef.current.value = "";
    if (res.ok) {
      router.refresh();
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? t("extractFailed"));
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{t("uploadPages")}</h2>
          <p className="mt-0.5 text-xs text-zinc-400">{t("uploadHint")}</p>
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          <CameraIcon size={16} aria-hidden />
          {pending ? t("uploading") : t("uploadPages")}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
