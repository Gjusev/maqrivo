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
  promotion,
  recipe,
  recipeIngredient,
  retailer,
  store,
  user as userTable,
  userPreferences,
  userStorePrefs,
  usersProfile,
} from "@maqrivo/db";
import { runWeeklyPlanForUser } from "../server/optimization/planner";

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
  if (!independent) throw new Error("global seed missing independent retailer");
  const butcher = (
    await db
      .insert(store)
      .values({
        retailerId: independent.id,
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

  // Concept slug → id (global seed guarantees presence).
  const conceptId = async (slug: string) =>
    (await db.select().from(foodConcept).where(eq(foodConcept.slug, slug)).limit(1))[0]!.id;

  // The planner only considers stores the user enabled (two-tier model).
  await db.insert(userStorePrefs).values([
    { userId, storeId: butcher.id, enabled: true, favorite: true, distanceM: 380 },
  ]);

  // Nearby chain supermarket: the basket optimizer needs priced grocery
  // candidates beyond the butcher counter, or every non-meat requirement
  // lands in "infeasible" and the shopping list stays empty.
  const carrefour = (
    await db.select().from(retailer).where(eq(retailer.slug, "carrefour")).limit(1)
  )[0];
  if (!carrefour) throw new Error("global seed missing carrefour retailer");
  const market = (
    await db
      .insert(store)
      .values({
        retailerId: carrefour.id,
        name: "Carrefour Market — Rond-Point Bezons",
        format: "supermarket",
        address: "52 rue du Bois, 92400 Courbevoie",
        lat: 48.9021,
        lng: 2.2462,
        origin: "retailer",
        source: "seed",
        tags: [],
      })
      .returning()
  )[0]!;
  await db.insert(userStorePrefs).values({
    userId,
    storeId: market.id,
    enabled: true,
    favorite: false,
    distanceM: 720,
  });

  // Catalog grocery items covering every seed-recipe concept (grams, so the
  // planner's packaged-candidate branch applies). Poultry is halal-gated.
  const GROCERY: [slug: string, nameFr: string, packG: number, cents: number, halal?: boolean][] = [
    ["whole-chicken", "Poulet fermier halal (1,2 kg)", 1200, 899, true],
    ["rice-basmati", "Riz basmati 1 kg", 1000, 285],
    ["olive-oil", "Huile d'olive 75 cl", 750, 629],
    ["onion", "Oignons jaunes 1 kg", 1000, 160],
    ["carrot", "Carottes 1 kg", 1000, 110],
    ["cumin", "Cumin moulu 40 g", 40, 195],
    ["lentils-coral", "Lentilles corail 500 g", 500, 175],
    ["canned-tomatoes", "Tomates concassées 400 g", 400, 95],
    ["garlic", "Ail 200 g", 200, 140],
    ["ginger", "Gingembre 100 g", 100, 120],
    ["curry-powder", "Curry en poudre 50 g", 50, 185],
    ["coconut-milk", "Lait de coco 400 ml", 400, 165],
    ["oats", "Flocons d'avoine 500 g", 500, 115],
    ["milk", "Lait demi-écrémé 1 L", 1000, 105],
    ["banana", "Bananes 1 kg", 1000, 150],
    ["protein-powder", "Whey protéine vanille 900 g", 900, 1990],
    ["almonds", "Amandes 200 g", 200, 245],
  ];
  for (const [slug, nameFr, packG, cents, halal] of GROCERY) {
    const item = (
      await db
        .insert(product)
        .values({
          name: nameFr,
          nameFr,
          foodConceptId: await conceptId(slug),
          purchasingMode: "PACKAGED",
          packageQuantity: String(packG),
          packageUnit: "g",
          source: "seed",
          halalState: halal ? "CONFIRMED" : "UNKNOWN",
        })
        .returning()
    )[0]!;
    await db.insert(priceObservation).values({
      productId: item.id,
      storeId: market.id,
      amountCents: cents,
      priceBasis: "unit",
      source: "retailer",
    });
  }

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

  // Deterministic provenance fixture for the Offers acceptance test. It is
  // store-scoped so deleting/reseeding the dev user removes it by cascade.
  await db.insert(promotion).values({
    retailerId: independent.id,
    storeId: butcher.id,
    descriptionRaw: "Blanc de poulet — prix observé en magasin",
    promoPriceCents: 790,
    mechanism: "PROMO_PRICE",
    validFrom: isoDateIn(0),
    validUntil: isoDateIn(14),
    source: "user",
    verification: "USER_OBSERVED",
    confidence: "HIGH",
    createdByUserId: userId,
  });

  // Three realistic seed recipes (structured ingredients → deterministic macros).
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

  // Deterministic meal plan + shopping list through the REAL planner path
  // (CP-SAT solver, no AI): the shopping acceptance test expects euro-priced
  // solver items without clicking "generate" first.
  const plan = await runWeeklyPlanForUser(userId);
  if (!plan.ok) throw new Error(`seed plan generation failed: ${plan.error ?? "unknown"}`);

  console.log(
    `seed: dev user ${DEV_EMAIL} ready (profile, 3 recipes, pantry, butcher store, 1 price, 1 promotion, weekly plan)`,
  );
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
