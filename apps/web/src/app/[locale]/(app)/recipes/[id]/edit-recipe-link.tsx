"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";

export function EditRecipeLink({ recipeId }: { recipeId: string }) {
  const tc = useTranslations("Common");
  return (
    <Link href={`/recipes/${recipeId}/edit`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
      <PencilSimpleIcon size={13} aria-hidden />
      {tc("edit")}
    </Link>
  );
}
