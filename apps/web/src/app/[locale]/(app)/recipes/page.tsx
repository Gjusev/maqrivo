import { getLocale, getTranslations } from "next-intl/server";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { db } from "@/server/db";
import { recipe, userRecipePrefs } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { CookingPotIcon } from "@phosphor-icons/react/dist/ssr/CookingPot";
import { NewRecipeLink } from "./new-recipe-link";
import { GenerateRecipeButton } from "./generate-recipe-button";
import { RecipeList } from "./recipe-list";

export default async function RecipesPage() {
  const t = await getTranslations("Recipes");
  const locale = await getLocale();
  const session = await getSessionContext();
  if (!session) return null;

  const owned = or(eq(recipe.ownerUserId, session.userId), isNull(recipe.ownerUserId));
  const rows = await db
    .select({ recipe: recipe, favorite: userRecipePrefs.favorite })
    .from(recipe)
    .leftJoin(
      userRecipePrefs,
      and(eq(userRecipePrefs.recipeId, recipe.id), eq(userRecipePrefs.userId, session.userId)),
    )
    .where(owned)
    .orderBy(desc(userRecipePrefs.favorite), desc(recipe.updatedAt))
    .limit(200);

  // Sibling count: the list is capped at 200 — the client hint says so instead
  // of truncating silently.
  const total = (await db.select({ total: sql<number>`count(*)::int` }).from(recipe).where(owned))[0]!.total;

  const items = rows.map(({ recipe: r, favorite }) => ({
    id: r.id,
    name: (locale === "fr" ? (r.nameFr ?? r.nameEn) : (r.nameEn ?? r.nameFr)) ?? "",
    sub: [
      `${r.servings} ${t("servings")}`,
      r.prepMinutes != null || r.cookMinutes != null
        ? `${String((r.prepMinutes ?? 0) + (r.cookMinutes ?? 0))} min`
        : null,
      ...r.mealTypes.slice(0, 2),
    ]
      .filter(Boolean)
      .join(" · "),
    favorite: favorite ?? false,
    own: r.ownerUserId === session.userId,
  }));

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
        <RecipeList items={items} total={total} />
      )}
    </>
  );
}
