"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { deleteRecipeAction, duplicateRecipeAction, toggleFavoriteRecipeAction } from "@/server/recipes/actions";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";

export function RecipeActions({ recipeId, favorite, own }: { recipeId: string; favorite: boolean; own: boolean }) {
  const t = useTranslations("Meals");
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(favorite);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={`btn-ghost px-2 ${isFavorite ? "text-amber-500" : "text-zinc-300"}`}
        aria-label={isFavorite ? t("unfavorite") : t("favorite")}
        aria-pressed={isFavorite}
        onClick={async () => {
          const result = await toggleFavoriteRecipeAction(recipeId);
          if (result.ok && result.data) setIsFavorite(result.data.favorite);
        }}
      >
        <StarIcon size={18} weight={isFavorite ? "fill" : "regular"} aria-hidden />
      </button>
      <button
        type="button"
        className="btn-ghost px-2 text-zinc-400"
        aria-label={t("duplicate")}
        onClick={async () => {
          const result = await duplicateRecipeAction(recipeId);
          if (result.ok) router.refresh();
        }}
      >
        <CopyIcon size={17} aria-hidden />
      </button>
      {own ? (
        <button
          type="button"
          className="btn-ghost px-2 text-zinc-300 hover:text-red-500"
          aria-label="delete"
          onClick={async () => {
            await deleteRecipeAction(recipeId);
            router.refresh();
          }}
        >
          <TrashIcon size={17} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
