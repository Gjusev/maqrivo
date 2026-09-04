import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  mealPlan,
  mealSlot,
  nutritionProfile,
  pantryItem,
  priceObservation,
  promotion,
  recipe,
  recipeIngredient,
  shoppingItem,
  shoppingPlan,
  store,
  userPreferences,
  userStorePrefs,
  usersProfile,
} from "@maqrivo/db";
import { auth } from "@/server/auth";

/** User data portability: everything the account owns, as one JSON document. */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const [profileRow] = await db.select().from(usersProfile).where(eq(usersProfile.userId, userId)).limit(1);
  const nutrition = await db
    .select()
    .from(nutritionProfile)
    .where(eq(nutritionProfile.userId, userId))
    .orderBy(desc(nutritionProfile.createdAt));
  const [preferences] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  const ownedStores = await db.select().from(store).where(eq(store.ownerUserId, userId));
  const storePrefs = await db.select().from(userStorePrefs).where(eq(userStorePrefs.userId, userId));
  const ownedRecipes = await db.select().from(recipe).where(eq(recipe.ownerUserId, userId));
  const recipeIngredients = (
    await Promise.all(
      ownedRecipes.map((r) => db.select().from(recipeIngredient).where(eq(recipeIngredient.recipeId, r.id))),
    )
  ).flat();
  const pantry = await db.select().from(pantryItem).where(eq(pantryItem.userId, userId));
  const observations = await db.select().from(priceObservation).where(eq(priceObservation.createdByUserId, userId));
  const manualPromotions = await db.select().from(promotion).where(eq(promotion.createdByUserId, userId));
  const plans = await db.select().from(mealPlan).where(eq(mealPlan.userId, userId)).orderBy(desc(mealPlan.weekStart));
  const slots = (await Promise.all(plans.map((p) => db.select().from(mealSlot).where(eq(mealSlot.mealPlanId, p.id))))).flat();
  const shoppingPlans = await db
    .select()
    .from(shoppingPlan)
    .where(eq(shoppingPlan.userId, userId))
    .orderBy(desc(shoppingPlan.createdAt));
  const shoppingItems = (
    await Promise.all(
      shoppingPlans.map((p) => db.select().from(shoppingItem).where(eq(shoppingItem.shoppingPlanId, p.id))),
    )
  ).flat();
  const document = {
    format: "maqrivo-user-export/1",
    exportedAt: new Date().toISOString(),
    profile: profileRow ?? null,
    nutritionProfiles: nutrition,
    preferences: preferences ?? null,
    customStores: ownedStores,
    storePreferences: storePrefs,
    recipes: ownedRecipes.map((r) => ({
      ...r,
      ingredients: recipeIngredients.filter((i) => i.recipeId === r.id),
    })),
    pantry: pantry,
    priceObservations: observations,
    manualPromotions: manualPromotions,
    mealPlans: plans.map((p) => ({ ...p, slots: slots.filter((s) => s.mealPlanId === p.id) })),
    shoppingPlans: shoppingPlans.map((p) => ({
      ...p,
      items: shoppingItems.filter((i) => i.shoppingPlanId === p.id),
    })),
  };

  return new NextResponse(JSON.stringify(document, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="maqrivo-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
