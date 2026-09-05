"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { runWeeklyPlanAction } from "@/server/optimization/actions";
import { CircleNotchIcon } from "@phosphor-icons/react/dist/csr/CircleNotch";

export function GeneratePlanButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const t = useTranslations("Week");
  const te = useTranslations("Errors");
  const tr = useTranslations("Recipes");
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
                ? tr("noRecipes")
                : result.error === "solver-unavailable"
                  ? te("solverUnavailable")
                  : te("error"),
            );
          }
        }}
      >
        {pending ? (
          <>
            <CircleNotchIcon size={16} className="animate-spin" aria-hidden />
            {t("regenerating")}
          </>
        ) : (
          t("regenerate")
        )}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
