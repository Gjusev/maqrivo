"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { runWeeklyPlanAction } from "@/server/optimization/actions";

export function GeneratePlanButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const t = useTranslations("Week");
  const te = useTranslations("Errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={variant === "primary" ? "btn-primary" : "btn-secondary"}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await runWeeklyPlanAction("BALANCED");
          setPending(false);
          if (result.ok) {
            router.refresh();
          } else {
            setError(
              result.error === "no-recipes"
                ? "recipes"
                : result.error === "solver-unavailable"
                  ? te("solverUnavailable")
                  : te("error"),
            );
          }
        }}
      >
        {pending ? "…" : t("regenerate")}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
