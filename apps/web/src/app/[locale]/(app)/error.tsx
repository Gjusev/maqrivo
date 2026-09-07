"use client";

import { useTranslations } from "next-intl";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <p className="text-sm font-semibold text-zinc-900">{t("boundaryTitle")}</p>
      <p className="mt-1 text-sm text-zinc-500">{t("boundaryHint")}</p>
      {error.digest ? <p className="mt-2 text-xs text-zinc-400">{error.digest}</p> : null}
      <button type="button" className="btn-primary mt-4" onClick={reset}>
        {t("boundaryRetry")}
      </button>
    </div>
  );
}
