"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";

export function NewRecipeLink({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const t = useTranslations("Recipes");
  return (
    <Link href="/recipes/new" className={variant === "primary" ? "btn-primary" : "btn-secondary"}>
      <PlusIcon size={16} aria-hidden />
      {t("create")}
    </Link>
  );
}
