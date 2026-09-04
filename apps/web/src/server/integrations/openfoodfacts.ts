/**
 * Open Food Facts client + normalizer.
 * Reads: API v3 for barcode products (officially recommended).
 * Search: v2 (v3 search not yet implemented upstream).
 * Normalization is a pure function, fixture-tested: OFF payload → our product shape.
 */
import { z } from "zod";
import { politeFetchJson } from "./http";

const nutrimentsSchema = z.object({
  "energy-kcal_100g": z.number().optional(),
  "proteins_100g": z.number().optional(),
  "carbohydrates_100g": z.number().optional(),
  "fat_100g": z.number().optional(),
  "saturated-fat_100g": z.number().optional(),
  "fiber_100g": z.number().optional(),
  "sugars_100g": z.number().optional(),
  "salt_100g": z.number().optional(),
});

export const offProductSchema = z.object({
  code: z.string().optional(),
  product_name: z.string().optional(),
  product_name_fr: z.string().optional(),
  product_name_en: z.string().optional(),
  generic_name: z.string().optional(),
  brands: z.string().optional(),
  quantity: z.string().optional(),
  categories: z.string().optional(),
  ingredients_text: z.string().optional(),
  allergens_tags: z.array(z.string()).optional(),
  labels_tags: z.array(z.string()).optional(),
  image_front_url: z.string().optional(),
  serving_quantity: z.number().optional(),
  nutriments: nutrimentsSchema.optional(),
});

export const offV3Response = z.object({
  status: z.union([z.literal("success"), z.literal("failure")]).optional(),
  code: z.string().optional(),
  product: offProductSchema.optional(),
  result: offProductSchema.optional(),
});

/** Normalized OFF product ready to become a Maqrivo product row. */
export interface NormalizedOffProduct {
  barcode: string;
  name: string;
  brand: string | null;
  category: string | null;
  packageQuantity: number | null;
  packageUnit: "g" | "ml" | "unit" | null;
  purchasingMode: "PACKAGED" | "WEIGHT" | "UNIT";
  ingredients: string | null;
  allergens: string[];
  organic: boolean;
  /** OFF labels are claims, never certification proof. */
  halalClaimed: boolean;
  imageUrl: string | null;
  nutrition:
    | {
        basis: "100g" | "100ml";
        energyKcal: number | null;
        proteinG: number | null;
        carbohydrateG: number | null;
        fatG: number | null;
        saturatedFatG: number | null;
        fiberG: number | null;
        sugarsG: number | null;
        saltG: number | null;
      }
    | null;
  offId: string;
}

/** Parse OFF "quantity" strings: "600 g", "1,5 L", "6 x 125 g", "1 L". */
export function parseOffQuantity(raw: string | undefined): {
  quantity: number;
  unit: "g" | "ml" | "unit";
} | null {
  if (!raw) return null;
  // "6 x 125 g" → total 750 g
  const multi = /^(\d+[.,]?\d*)\s*x\s*(\d+[.,]?\d*)\s*(g|kg|ml|cl|l)\b/i.exec(raw.trim());
  if (multi) {
    const count = Number(multi[1]!.replace(",", "."));
    const unitSize = Number(multi[2]!.replace(",", "."));
    const unit = multi[3]!.toLowerCase();
    const total = count * unitSize;
    return normalizeUnit(total, unit);
  }
  const single = /^(\d+[.,]?\d*)\s*(g|kg|ml|cl|l)\b/i.exec(raw.trim());
  if (single) {
    return normalizeUnit(Number(single[1]!.replace(",", ".")), single[2]!.toLowerCase());
  }
  const countOnly = /^(\d+)\s*(pièces|pieces|œufs|eggs|unités|units)?/i.exec(raw.trim());
  if (countOnly) return { quantity: Number(countOnly[1]), unit: "unit" };
  return null;
}

function normalizeUnit(amount: number, unit: string): { quantity: number; unit: "g" | "ml" } {
  if (unit === "kg") return { quantity: amount * 1000, unit: "g" };
  if (unit === "l") return { quantity: amount * 1000, unit: "ml" };
  if (unit === "cl") return { quantity: amount * 10, unit: "ml" };
  return { quantity: amount, unit: unit === "ml" ? "ml" : "g" };
}

/** Pure mapping from an OFF product payload to our normalized shape. */
export function normalizeOffProduct(payload: z.infer<typeof offProductSchema>): NormalizedOffProduct | null {
  const barcode = payload.code ?? "";
  const name = payload.product_name_fr || payload.product_name || payload.product_name_en || "";
  if (!barcode || !name) return null;

  const pack = parseOffQuantity(payload.quantity);
  const allergens = (payload.allergens_tags ?? [])
    .map((tag) => tag.replace(/^..:/, "").trim())
    .filter((a) => a.length > 0);
  const labels = payload.labels_tags ?? [];
  const basis: "100g" | "100ml" = pack?.unit === "ml" ? "100ml" : "100g";
  const n = payload.nutriments;

  const anyNutrient =
    n &&
    (n["energy-kcal_100g"] !== undefined ||
      n["proteins_100g"] !== undefined ||
      n["fat_100g"] !== undefined ||
      n["carbohydrates_100g"] !== undefined);

  return {
    barcode,
    name,
    brand: payload.brands?.split(",")[0]?.trim() || null,
    category: payload.categories?.split(",")[0]?.trim() || null,
    packageQuantity: pack?.quantity ?? null,
    packageUnit: pack?.unit ?? null,
    purchasingMode: pack?.unit === "unit" ? "UNIT" : "PACKAGED",
    ingredients: payload.ingredients_text || null,
    allergens,
    organic: labels.includes("en:organic"),
    halalClaimed: labels.includes("en:halal") || labels.includes("fr:halal"),
    imageUrl: payload.image_front_url || null,
    nutrition: anyNutrient
      ? {
          basis,
          energyKcal: n?.["energy-kcal_100g"] ?? null,
          proteinG: n?.["proteins_100g"] ?? null,
          carbohydrateG: n?.["carbohydrates_100g"] ?? null,
          fatG: n?.["fat_100g"] ?? null,
          saturatedFatG: n?.["saturated-fat_100g"] ?? null,
          fiberG: n?.["fiber_100g"] ?? null,
          sugarsG: n?.["sugars_100g"] ?? null,
          saltG: n?.["salt_100g"] ?? null,
        }
      : null,
    offId: barcode,
  };
}

export async function fetchOffProductV3(barcode: string): Promise<NormalizedOffProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,product_name_fr,product_name_en,generic_name,brands,quantity,categories,ingredients_text,allergens_tags,labels_tags,image_front_url,serving_quantity,nutriments`;
  const json = await politeFetchJson<unknown>(url, { source: "openfoodfacts" });
  const parsed = offV3Response.safeParse(json);
  if (!parsed.success || parsed.data.status === "failure") return null;
  const product = parsed.data.product ?? parsed.data.result;
  if (!product) return null;
  // v3 nests the code on the product but not always; fall back to the envelope.
  return normalizeOffProduct({ ...product, code: product.code ?? parsed.data.code ?? "" });
}
