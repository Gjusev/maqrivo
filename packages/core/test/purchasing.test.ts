import { describe, expect, it } from "vitest";
import {
  contentOfPacks,
  effectiveCostCents,
  packsNeeded,
  residualCreditCents,
  RESIDUAL_RATES,
  weightCostCents,
} from "../src/purchasing/packages";
import { netRequirements, type PantryStock } from "../src/purchasing/pantry";
import { computeValueMetrics } from "../src/metrics/metrics";
import { freshnessOf } from "../src/freshness/policies";

describe("package math", () => {
  it("700 g from 600 g packs needs 2 packs; from 1 kg needs 1", () => {
    expect(packsNeeded(700, 600)).toBe(2);
    expect(packsNeeded(700, 1000)).toBe(1);
  });

  it("exact needs need exact packs", () => {
    expect(packsNeeded(600, 600)).toBe(1);
    expect(packsNeeded(1200, 600)).toBe(2);
  });

  it("zero need needs zero packs", () => {
    expect(packsNeeded(0, 600)).toBe(0);
  });

  it("content of packs multiplies", () => {
    expect(contentOfPacks(2, 600)).toBe(1200);
  });

  it("rejects nonsensical pack sizes", () => {
    expect(() => packsNeeded(100, 0)).toThrow();
  });
});

describe("weight purchases", () => {
  it("butcher chicken: 700 g at €8.90/kg costs €6.23", () => {
    // 700 × 890 / 1000 = 623
    expect(weightCostCents(700, 890)).toBe(623);
  });

  it("rounds half up on odd gram counts", () => {
    // 455 g × 8.90 €/kg = 4.0495 € → 405 cents
    expect(weightCostCents(455, 890)).toBe(405);
  });
});

describe("residual value and effective cost", () => {
  it("storable surplus is credited at 80 %", () => {
    // 1 kg rice pack for 700 g need: 300 g × 2.50 €/kg × 0.8 = 60 cents
    expect(residualCreditCents(300, 250, "storable")).toBe(60);
  });

  it("fresh surplus is credited at 20 %", () => {
    // 1 kg chicken for 700 g: 300 g × 8.90 €/kg × 0.2 = 53.4 → 53
    expect(residualCreditCents(300, 890, "fresh")).toBe(53);
  });

  it("semi-perishable rate is 50 %", () => {
    expect(RESIDUAL_RATES.semi).toBe(0.5);
    expect(residualCreditCents(1000, 200, "semi")).toBe(100);
  });

  it("no surplus, no credit", () => {
    expect(residualCreditCents(0, 890, "fresh")).toBe(0);
  });

  it("effective cost = paid − credit, floored at zero", () => {
    expect(effectiveCostCents(949, 300, 890, "fresh")).toBe(896); // 949 − 53
    expect(effectiveCostCents(10, 10_000, 890, "fresh")).toBe(0);
  });
});

describe("pantry deduction", () => {
  const pantry: PantryStock[] = [
    { conceptId: "chicken-breast", quantityBase: 400, expiresOn: "2026-09-08" },
    { conceptId: "rice", quantityBase: 1000, expiresOn: null },
  ];

  it("deducts pantry from weekly needs", () => {
    const net = netRequirements(
      [
        { conceptId: "chicken-breast", quantityBase: 700, shelfLifeClass: "fresh" },
        { conceptId: "rice", quantityBase: 500, shelfLifeClass: "storable" },
        { conceptId: "potatoes", quantityBase: 1000, shelfLifeClass: "semi" },
      ],
      pantry,
      "2026-09-07",
    );
    expect(net.find((r) => r.conceptId === "chicken-breast")?.quantityBase).toBe(300);
    expect(net.find((r) => r.conceptId === "rice")?.quantityBase).toBe(0);
    expect(net.find((r) => r.conceptId === "potatoes")?.quantityBase).toBe(1000);
  });

  it("expired stock never counts", () => {
    const net = netRequirements(
      [{ conceptId: "chicken-breast", quantityBase: 700, shelfLifeClass: "fresh" }],
      [{ conceptId: "chicken-breast", quantityBase: 500, expiresOn: "2026-09-01" }],
      "2026-09-07",
    );
    expect(net[0]?.quantityBase).toBe(700);
  });

  it("stock expiring during the plan still counts — cook it first", () => {
    const net = netRequirements(
      [{ conceptId: "chicken-breast", quantityBase: 700, shelfLifeClass: "fresh" }],
      [{ conceptId: "chicken-breast", quantityBase: 500, expiresOn: "2026-09-09" }],
      "2026-09-07",
    );
    expect(net[0]?.quantityBase).toBe(200);
  });

  it("leftover pantry stock is not wasted into other concepts", () => {
    const net = netRequirements(
      [{ conceptId: "rice", quantityBase: 300, shelfLifeClass: "storable" }],
      [{ conceptId: "rice", quantityBase: 2000, expiresOn: null }],
      "2026-09-07",
    );
    expect(net[0]?.quantityBase).toBe(0);
  });
});

describe("value metrics (protein per euro)", () => {
  const now = new Date("2026-09-04T12:00:00Z");

  it("computes protein per euro and cost per 10 g protein", () => {
    // Eggs: 12.5 g protein/100g, 6-pack 372 g at €2.10
    const m = computeValueMetrics({
      proteinPer100: 12.5,
      energyKcalPer100: 143,
      priceCents: 210,
      quantityBase: 372,
      freshness: freshnessOf(now, "user", now),
    });
    // 46.5 g protein / 2.10 € = 22.14 g/€ → 22.1
    expect(m.proteinPerEuro).toBe(22.1);
    // 210 × 10 / 46.5 = 45.16 → 45 cents per 10 g
    expect(m.costPer10gProteinCents).toBe(45);
    // 531.96 kcal / 2.10 € = 253.3 → 253
    expect(m.caloriesPerEuro).toBe(253);
  });

  it("refuses metrics on stale prices — no evidence, no deal", () => {
    const staleObserved = new Date(now.getTime() - 30 * 86_400_000);
    const m = computeValueMetrics({
      proteinPer100: 12.5,
      energyKcalPer100: 143,
      priceCents: 210,
      quantityBase: 372,
      freshness: freshnessOf(staleObserved, "user", now),
    });
    expect(m.proteinPerEuro).toBeNull();
    expect(m.costPer10gProteinCents).toBeNull();
    expect(m.caloriesPerEuro).toBeNull();
  });

  it("refuses metrics without protein data", () => {
    const m = computeValueMetrics({
      proteinPer100: null,
      energyKcalPer100: 143,
      priceCents: 210,
      quantityBase: 372,
      freshness: freshnessOf(now, "user", now),
    });
    expect(m.proteinPerEuro).toBeNull();
  });

  it("refuses metrics without any price observation", () => {
    const m = computeValueMetrics({
      proteinPer100: 12.5,
      energyKcalPer100: 143,
      priceCents: 210,
      quantityBase: 372,
      freshness: null,
    });
    expect(m.proteinPerEuro).toBeNull();
  });

  it("butcher chicken vs Carrefour pack comparison is honest arithmetic", () => {
    // Butcher: 31 g/100g at 890 cents/kg → per euro: 1000/100×31 / 8.90 = 34.8 g/€
    const butcher = computeValueMetrics({
      proteinPer100: 31,
      energyKcalPer100: 165,
      priceCents: 890,
      quantityBase: 1000,
      freshness: freshnessOf(now, "user", now),
    });
    // Carrefour: 600 g pack at €6.49, same composition
    const pack = computeValueMetrics({
      proteinPer100: 31,
      energyKcalPer100: 165,
      priceCents: 649,
      quantityBase: 600,
      freshness: freshnessOf(now, "user", now),
    });
    expect(butcher.proteinPerEuro).toBe(34.8);
    expect(pack.proteinPerEuro).toBe(28.7); // 186 g / 6.49 €
  });
});
