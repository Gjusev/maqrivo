/**
 * Monoprix adapter — the public catalogue application's official Dewib API
 * exposes structured, EAN-keyed promotions. This calls the same anonymous
 * GET surface as catalogue.monoprix.fr; it does not evaluate the Nuxt state.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { politeFetchJson } from "../http";
import { registerFlipbook, type RemoteCatalogue, type RemoteCatalogueItem } from "./flipbook";
import { decimalEurosToCents } from "./html";

const SOURCE = "monoprix";
const API_BASE = "https://api.rcdss.monoprix.fr/rest/api";
const CATALOGUE_URL = "https://catalogue.monoprix.fr/department/epicerie-salee";
const DEPARTMENTS = ["epicerie-salee", "epicerie-sucree"] as const;

const dateSchema = z.object({ date: z.string() }).loose();
const promotionTypeSchema = z
  .object({
    fidelity: z.boolean().nullish(),
    name: z.string().nullish(),
    cartQuantity: z.union([z.string(), z.number()]).nullish(),
    discount: z.union([z.string(), z.number()]).nullish(),
    discountUnit: z.string().nullish(),
  })
  .loose();
const promotionSchema = z
  .object({
    promotionId: z.string(),
    operation: z.union([z.string(), z.number()]).nullish(),
    discountPrice: z.string().nullish(),
    discountMeasureUnitPrice: z.string().nullish(),
    startDate: dateSchema,
    endDate: dateSchema,
    validityDate: z.string().nullish(),
    promotionType: z.array(promotionTypeSchema).nullish(),
    product: z
      .object({
        ean: z.union([z.string(), z.number()]).nullish(),
        title: z.string(),
        shortDescription: z.string().nullish(),
        priceBase: z.string().nullish(),
        measureUnit: z.string().nullish(),
        brand: z
          .union([z.object({ name: z.string().nullish() }).loose(), z.string()])
          .nullish(),
        department: z.object({ title: z.string().nullish() }).loose().nullish(),
      })
      .loose(),
  })
  .loose();
const payloadSchema = z.object({
  items: z.array(
    z.object({
      department: z.object({ title: z.string().nullish() }).loose().nullish(),
      promotions: z.array(promotionSchema),
    }),
  ),
});

function isoFrenchDate(value: string): string | null {
  const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (french) return `${french[3]}-${french[2]}-${french[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function cleanEan(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const digits = String(value).trim();
  return /^\d{6,14}$/.test(digits) ? digits : null;
}

function pricePerKgCents(
  value: string | null | undefined,
  measureUnit: string | null | undefined,
): number | null {
  const cents = decimalEurosToCents(value);
  if (cents == null || !measureUnit) return null;
  if (/\bkg\b/i.test(measureUnit)) return cents;
  if (/100\s*g/i.test(measureUnit)) return cents * 10;
  return null;
}

interface GroupedPromotion {
  readonly operation: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly item: RemoteCatalogueItem;
}

function monoprixPromotions(payload: unknown): GroupedPromotion[] {
  const parsed = payloadSchema.parse(payload);
  const result: GroupedPromotion[] = [];
  for (const group of parsed.items) {
    for (const promotion of group.promotions) {
      const priceCents = decimalEurosToCents(promotion.discountPrice);
      const validFrom = isoFrenchDate(promotion.startDate.date);
      const validUntil = isoFrenchDate(promotion.endDate.date);
      if (priceCents == null || !validFrom || !validUntil) continue;
      const baseCents = decimalEurosToCents(promotion.product.priceBase);
      const types = promotion.promotionType ?? [];
      const brand = promotion.product.brand;
      const typeText = types.map((type) => type.name?.trim()).filter(Boolean).join(" · ");
      const mainType = types[0];
      const secondUnit = /2(?:e|ème)/i.test(typeText);
      const freeUnits = /(\d+)\s*\+\s*(\d+)/.exec(typeText);
      const discountPct =
        mainType?.discountUnit === "percent"
          ? Number.parseInt(String(mainType.discount ?? "0"), 10) || null
          : null;
      const minQty = Number.parseInt(String(mainType?.cartQuantity ?? "0"), 10) || null;
      const mechanism: RemoteCatalogueItem["mechanism"] = freeUnits
        ? "BUY_X_GET_Y"
        : secondUnit
          ? "SECOND_UNIT_DISCOUNT"
          : mainType?.fidelity
            ? "LOYALTY_PRICE"
            : discountPct
              ? "PERCENTAGE_OFF"
              : "PROMO_PRICE";
      result.push({
        operation: String(promotion.operation ?? "promotions"),
        validFrom,
        validUntil,
        item: {
          ean: cleanEan(promotion.product.ean),
          label: promotion.product.title.replace(/\s+/g, " ").trim(),
          brand:
            typeof brand === "string"
              ? brand.trim() || null
              : brand?.name?.replace(/\s+/g, " ").trim() || null,
          priceCents,
          regularPriceCents: baseCents != null && baseCents > priceCents ? baseCents : null,
          pricePerKgCents: pricePerKgCents(
            promotion.discountMeasureUnitPrice,
            promotion.product.measureUnit,
          ),
          packaging: promotion.product.shortDescription?.replace(/\s+/g, " ").trim() || null,
          category:
            promotion.product.department?.title ?? group.department?.title ?? null,
          loyalty: types.some((type) => type.fidelity === true),
          validityText: [promotion.validityDate, typeText].filter(Boolean).join(" · ") || null,
          mechanism,
          minQty,
          payQty: freeUnits ? Number.parseInt(freeUnits[1] ?? "0", 10) : null,
          getQty: freeUnits ? Number.parseInt(freeUnits[2] ?? "0", 10) : null,
          discountPct,
          conditionsRaw: typeText || null,
          page: null,
        },
      });
    }
  }
  return result;
}

export function monoprixCataloguesFromPayloads(payloads: readonly unknown[]): RemoteCatalogue[] {
  const grouped = new Map<string, GroupedPromotion[]>();
  for (const promotion of payloads.flatMap(monoprixPromotions)) {
    const key = `${promotion.operation}|${promotion.validFrom}|${promotion.validUntil}`;
    grouped.set(key, [...(grouped.get(key) ?? []), promotion]);
  }

  return Array.from(grouped.values(), (promotions) => {
    const first = promotions[0]!;
    const fingerprint = createHash("sha256")
      .update(promotions.map((entry) => entry.item.ean ?? entry.item.label).join("|"))
      .digest("hex")
      .slice(0, 10);
    return {
      externalId: `${first.operation}-${first.validFrom}-${first.validUntil}-${fingerprint}`,
      title: "Promotions Monoprix",
      validFrom: first.validFrom,
      validUntil: first.validUntil,
      sourceUrl: CATALOGUE_URL,
      pageImageUrls: [],
      items: promotions.map((entry) => entry.item),
    };
  });
}

function departmentUrl(slug: string): string {
  const query = new URLSearchParams({
    "displayStartDate[before]": "today",
    "endDate[after]": "today",
    "product.department.slug[]": slug,
    itemsPerPage: "48",
    page: "1",
  });
  return `${API_BASE}/promotion/by_department?${query.toString()}`;
}

async function fetchMonoprixPromotions(): Promise<RemoteCatalogue[]> {
  const payloads: unknown[] = [];
  for (const department of DEPARTMENTS) {
    payloads.push(
      await politeFetchJson<unknown>(departmentUrl(department), {
        source: SOURCE,
        headers: { "X-Retailer-Name": "monoprix" },
      }),
    );
  }
  return monoprixCataloguesFromPayloads(payloads);
}

registerFlipbook("monoprix", { source: fetchMonoprixPromotions, storeKeyed: false });
