import { getLocale, getTranslations } from "next-intl/server";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/server/db";
import { recipe, userRecipePrefs } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { CookingPotIcon } from "@phosphor-icons/react/dist/ssr/CookingPot";
import { Link } from "@/i18n/navigation";
import { NewRecipeLink } from "./new-recipe-link";
import { GenerateRecipeButton } from "./generate-recipe-button";
import { RecipeActions } from "./recipe-actions";

export default async function RecipesPage() {
  const t = await getTranslations("Recipes");
  const locale = await getLocale();
  const session = await getSessionContext();
  if (!session) return null;

  const rows = await db
    .select({ recipe: recipe, favorite: userRecipePrefs.favorite })
    .from(recipe)
    .leftJoin(
      userRecipePrefs,
      and(eq(userRecipePrefs.recipeId, recipe.id), eq(userRecipePrefs.userId, session.userId)),
    )
    .where(or(eq(recipe.ownerUserId, session.userId), isNull(recipe.ownerUserId)))
    .orderBy(desc(userRecipePrefs.favorite), desc(recipe.updatedAt));

  return (
    <>
      <PageHeader title={t("title")} action={(
          <div className="flex gap-2">
            <GenerateRecipeButton />
            <NewRecipeLink />
          </div>
        )} />

      {rows.length === 0 ? (
        <EmptyState icon={CookingPotIcon} title={t("noRecipes")} action={<NewRecipeLink variant="primary" />} />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ recipe: r, favorite }) => (
            <li key={r.id} className="card flex items-center gap-3 p-3.5">
              <Link href={`/recipes/${r.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-900">
                  {locale === "fr" ? (r.nameFr ?? r.nameEn) : (r.nameEn ?? r.nameFr)}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {[
                    `${r.servings} ${t("servings")}`,
                    r.prepMinutes != null || r.cookMinutes != null
                      ? `${String((r.prepMinutes ?? 0) + (r.cookMinutes ?? 0))} min`
                      : null,
                    ...r.mealTypes.slice(0, 2),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
              <RecipeActions recipeId={r.id} favorite={favorite ?? false} own={r.ownerUserId === session.userId} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
