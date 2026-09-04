/**
 * Development seed: a fictional user around a public Courbevoie reference
 * point, with recipes, pantry, a custom halal butcher store, a weight-mode
 * product and a price observation. Run AFTER the global seed.
 *
 *   DATABASE_URL=… SIGNUP_INVITE_CODE=… pnpm --filter @maqrivo/web seed
 */
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { auth } from "../server/auth";
import {
  foodConcept,
  nutritionProfile,
  pantryItem,
  priceObservation,
  product,
  recipe,
  recipeIngredient,
  retailer,
  store,
  user as userTable,
  userPreferences,
  usersProfile,
} from "@maqrivo/db";

const DEV_EMAIL = "dev@maqrivo.local";
const DEV_PASSWORD = "dev-password-123";
// Public reference point: Courbevoie town centre.
const HOME = { lat: 48.8967, lng: 2.2454, label: "Courbevoie" };

async function main() {
  const inviteCode = process.env.SIGNUP_INVITE_CODE ?? "change-me";

  // Idempotency: wipe and recreate the dev user's owned data.
  const existing = (await db.select().from(userTable).where(eq(userTable.email, DEV_EMAIL)).limit(1))[0];
  const existingProfile = existing
    ? null
    : await db.select().from(usersProfile).where(eq(usersProfile.displayName, "Dev")).limit(1);
  const priorUserId = existing?.id ?? existingProfile?.[0]?.userId ?? null;
  if (priorUserId) {
    await db.delete(userTable).where(eq(userTable.id, priorUserId));
  }

  const signUp = await auth.api.signUpEmail({
    // inviteCode is a transient gate field: accepted by the server hook,
    // not modelled in the typed surface.
    body: { name: "Dev User", email: DEV_EMAIL, password: DEV_PASSWORD, inviteCode } as {
      name: string;
      email: string;
      password: string;
      inviteCode: string;
    },
  });
  if (!signUp.user) throw new Error("seed sign-up failed");
  const userId = signUp.user.id;

  await db
    .update(usersProfile)
    .set({ homeLat: HOME.lat, homeLng: HOME.lng, locationLabel: HOME.label, displayName: "Dev" })
    .where(eq(usersProfile.userId, userId));

  await db.insert(nutritionProfile).values({
    userId,
    dailyKcal: 2500,
    proteinG: 170,
    carbohydrateG: 260,
    fatG: 80,
    fiberG: 30,
    mealsPerDay: 3,
    weeklyBudgetCents: 8000,
    halalRequired: true,
    allowUnknownHalal: false,
  });

  await db.insert(userPreferences).values({ userId, searchRadiusM: 2000, travelSensitivity: "medium" });

  // Custom halal butcher (the first-slice scenario's store).
  const independent = (
    await db.select().from(retailer).where(eq(retailer.slug, "independent")).limit(1)
  )[0];
  const butcher = (
    await db
      .insert(store)
      .values({
        retailerId: independent?.id ?? null,
        name: "Boucherie Halal du Centre",
        format: "butcher",
        address: "12 rue de Bezons, 92400 Courbevoie",
        lat: 48.8994,
        lng: 2.2497,
        origin: "user",
        ownerUserId: userId,
        source: "seed",
        tags: ["halal", "butcher"],
      })
      .returning()
  )[0]!;

  // Weight-mode product sold at the butcher, linked to the chicken concept.
  const chicken = (
    await db.select().from(foodConcept).where(eq(foodConcept.slug, "chicken-breast")).limit(1)
  )[0]!;
  const butcherChicken = (
    await db
      .insert(product)
      .values({
        ownerUserId: userId,
        name: "Blanc de poulet (boucherie)",
        nameFr: "Blanc de poulet (boucherie)",
        purchasingMode: "WEIGHT",
        foodConceptId: chicken.id,
        source: "user",
        halalState: "CONFIRMED",
        notes: "Sold at the counter, cut to order.",
      })
      .returning()
  )[0]!;

  await db.insert(priceObservation).values({
    productId: butcherChicken.id,
    storeId: butcher.id,
    amountCents: 890,
    priceBasis: "per_kg",
    source: "user",
    createdByUserId: userId,
  });

  // Three realistic seed recipes (structured ingredients → deterministic macros).
  const conceptId = async (slug: string) =>
    (await db.select().from(foodConcept).where(eq(foodConcept.slug, slug)).limit(1))[0]!.id;

  const mkRecipe = async (
    names: { fr: string; en: string },
    mealTypes: string[],
    minutes: { prep: number; cook: number },
    ingredients: [string, number, string][],
    steps: string[],
    tags: string[],
  ) => {
    const r = (
      await db
        .insert(recipe)
        .values({
          ownerUserId: userId,
          nameFr: names.fr,
          nameEn: names.en,
          servings: 2,
          prepMinutes: minutes.prep,
          cookMinutes: minutes.cook,
          mealTypes,
          tags,
          cuisine: "fr",
          instructions: steps,
          source: "seed",
        })
        .returning()
    )[0]!;
    for (const [slug, qty, unit] of ingredients) {
      await db.insert(recipeIngredient).values({
        recipeId: r.id,
        foodConceptId: await conceptId(slug),
        quantity: String(qty),
        unit,
      });
    }
    return r;
  };

  await mkRecipe(
    { fr: "Poulet rôti et riz", en: "Roast chicken with rice" },
    ["lunch", "dinner"],
    { prep: 15, cook: 40 },
    [
      ["whole-chicken", 800, "g"],
      ["rice-basmati", 160, "g"],
      ["olive-oil", 15, "ml"],
      ["onion", 120, "g"],
      ["carrot", 150, "g"],
      ["cumin", 3, "g"],
    ],
    [
      "Préchauffer le four à 200 °C.",
      "Badigeonner le poulet d'huile, assaisonner.",
      "Enfourner 40 minutes.",
      "Cuire le riz 10 minutes à couvert.",
      "Servir le poulet avec le riz et les légumes.",
    ],
    ["high-protein", "halal-friendly"],
  );

  await mkRecipe(
    { fr: "Dahl de lentilles corail", en: "Red lentil dahl" },
    ["lunch", "dinner"],
    { prep: 10, cook: 25 },
    [
      ["lentils-coral", 200, "g"],
      ["canned-tomatoes", 200, "g"],
      ["onion", 100, "g"],
      ["garlic", 8, "g"],
      ["ginger", 10, "g"],
      ["curry-powder", 5, "g"],
      ["coconut-milk", 100, "ml"],
      ["rice-basmati", 120, "g"],
    ],
    [
      "Faire revenir oignon, ail, gingère et épices.",
      "Ajouter lentilles, tomates et lait de coco.",
      "Mijoter 20 minutes.",
      "Servir avec le riz.",
    ],
    ["vegetarian", "high-protein", "budget"],
  );

  await mkRecipe(
    { fr: "Avoine protéinée banane", en: "Protein banana oats" },
    ["breakfast"],
    { prep: 5, cook: 5 },
    [
      ["oats", 80, "g"],
      ["milk", 250, "ml"],
      ["banana", 120, "g"],
      ["protein-powder", 30, "g"],
      ["almonds", 15, "g"],
    ],
    [
      "Chauffer le lait, ajouter les flocons.",
      "Cuire 4 minutes à feu doux.",
      "Hors du feu, incorporer la protéine.",
      "Garnir de banane et d'amandes.",
    ],
    ["high-protein", "breakfast", "quick"],
  );

  // Pantry starter: what the dev user "already has".
  await db.insert(pantryItem).values([
    { userId, foodConceptId: await conceptId("rice-basmati"), quantity: String(750), unit: "g" },
    { userId, foodConceptId: await conceptId("eggs"), quantity: String(6), unit: "unit", expiresOn: isoDateIn(10) },
    { userId, foodConceptId: await conceptId("chicken-breast"), quantity: String(300), unit: "g", expiresOn: isoDateIn(3) },
    { userId, foodConceptId: await conceptId("olive-oil"), quantity: String(500), unit: "ml" },
  ]);

  console.log(`seed: dev user ${DEV_EMAIL} ready (profile, 3 recipes, pantry, butcher store, 1 price)`);
}

function isoDateIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
