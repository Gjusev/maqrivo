/**
 * Global seed: retailers + curated FoodConcept catalog. Idempotent —
 * retailer metadata is refreshed while concepts are inserted only when missing.
 * Dev-user data is seeded separately in apps/web once auth exists (M3).
 */
import { sql } from "drizzle-orm";
import { createDb } from "../index";
import { foodConcept, retailer } from "../schema";
import { FOOD_CONCEPTS } from "./concepts";
import { RETAILERS } from "./retailers";

export async function seedGlobal(connectionString: string): Promise<void> {
  const db = createDb(connectionString);

  await db
    .insert(retailer)
    .values(RETAILERS.map((r) => ({ ...r, nameFr: r.nameFr ?? null, adapter: r.adapter ?? null })))
    .onConflictDoUpdate({
      target: retailer.slug,
      set: {
        name: sql`excluded.name`,
        nameFr: sql`excluded.name_fr`,
        kind: sql`excluded.kind`,
        adapter: sql`excluded.adapter`,
      },
    });

  await db.insert(foodConcept).values(
    FOOD_CONCEPTS.map((c) => ({
      slug: c[0],
      nameEn: c[1],
      nameFr: c[2],
      category: c[3],
      shelfLifeClass: c[4],
      basis: c[5] === "g" ? ("100g" as const) : ("100ml" as const),
      defaultUnit: c[5] === "g" ? "g" : "ml",
      energyKcal: c[6],
      proteinG: String(c[7]),
      carbohydrateG: String(c[8]),
      fatG: String(c[9]),
      saturatedFatG: String(c[10]),
      fiberG: String(c[11]),
      sugarsG: String(c[12]),
      saltG: String(c[13]),
    })),
  ).onConflictDoNothing({ target: foodConcept.slug });

  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(foodConcept);
  const conceptCount = rows[0]?.count ?? 0;
  console.log(`seed: ${String(RETAILERS.length)} retailers ensured, ${String(conceptCount)} food concepts present`);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
seedGlobal(connectionString)
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
