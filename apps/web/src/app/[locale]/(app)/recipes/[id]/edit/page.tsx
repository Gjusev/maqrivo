import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { foodConcept, recipe, recipeIngredient } from "@maqrivo/db";
import { getSessionContext } from "@/server/session";
import { PageHeader } from "@/components/page-header";
import { RecipeEditor } from "../../recipe-editor";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("Recipes");
  const session = await getSessionContext();
  if (!session) notFound();

  const existing = (await db.select().from(recipe).where(eq(recipe.id, id)).limit(1))[0];
  if (!existing || existing.ownerUserId !== session.userId) notFound();

  const ingredients = await db
    .select({ ing: recipeIngredient, concept: foodConcept })
    .from(recipeIngredient)
    .innerJoin(foodConcept, eq(recipeIngredient.foodConceptId, foodConcept.id))
    .where(eq(recipeIngredient.recipeId, id));

  return (
    <>
      <PageHeader title={t("create")} />
      <RecipeEditor
        initial={{
          id: existing.id,
          nameFr: existing.nameFr,
          nameEn: existing.nameEn,
          servings: existing.servings,
          prepMinutes: existing.prepMinutes,
          cookMinutes: existing.cookMinutes,
          mealTypes: existing.mealTypes,
          tags: existing.tags,
          instructions: existing.instructions ?? [],
          ingredients: ingredients.map(({ ing, concept }) => ({
            conceptId: concept.id,
            conceptNameFr: concept.nameFr,
            conceptNameEn: concept.nameEn,
            quantity: Number(ing.quantity),
            unit: ing.unit,
          })),
        }}
      />
    </>
  );
}
