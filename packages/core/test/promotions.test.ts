import { describe, expect, it } from "vitest";
import { effectiveCost, promotionState, savingsCents } from "../src/promotions/evaluate";

const noCard = { hasLoyaltyCard: false };
const card = { hasLoyaltyCard: true };

describe("PROMO_PRICE — prix promo", () => {
  it("charges the promo price per unit", () => {
    const r = effectiveCost({ mechanism: { kind: "PROMO_PRICE", promoPriceCents: 149 }, unitPriceCents: 249, count: 3, ...noCard });
    expect(r.totalCents).toBe(447);
    expect(r.applied).toBe(true);
    expect(r.perUnitCents).toBe(149);
  });

  it("is not applied when promo price is not lower", () => {
    const r = effectiveCost({ mechanism: { kind: "PROMO_PRICE", promoPriceCents: 300 }, unitPriceCents: 249, count: 1, ...noCard });
    expect(r.applied).toBe(false);
  });
});

describe("PERCENTAGE_OFF — remise immédiate", () => {
  it("applies percent off, rounded half up", () => {
    const r = effectiveCost({ mechanism: { kind: "PERCENTAGE_OFF", percent: 30 }, unitPriceCents: 199, count: 2, ...noCard });
    // 398 × 0.7 = 278.6 → 279
    expect(r.totalCents).toBe(279);
  });
});

describe("MULTIBUY — le lot (2 pour 5 €)", () => {
  const mech = { kind: "MULTIBUY", bundleQty: 2, bundlePriceCents: 500 } as const;

  it("one unit pays shelf price — NOT half the bundle", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 320, count: 1, ...noCard });
    expect(r.totalCents).toBe(320);
    expect(r.applied).toBe(false);
  });

  it("two units pay the bundle price", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 320, count: 2, ...noCard });
    expect(r.totalCents).toBe(500);
    expect(r.perUnitCents).toBe(250);
  });

  it("third unit pays shelf price on top of the bundle", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 320, count: 3, ...noCard });
    expect(r.totalCents).toBe(820);
    // effective per-unit is 273, not the naive -22% of the bundle
    expect(r.perUnitCents).toBe(273);
  });

  it("four units make two bundles", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 320, count: 4, ...noCard });
    expect(r.totalCents).toBe(1000);
  });
});

describe("BUY_X_GET_Y — le 3e gratuit", () => {
  const mech = { kind: "BUY_X_GET_Y", buyQty: 2, freeQty: 1 } as const;

  it("is NOT a flat 33 % discount: one unit pays full price", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 300, count: 1, ...noCard });
    expect(r.totalCents).toBe(300);
    expect(r.applied).toBe(false);
  });

  it("two units still pay full price", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 300, count: 2, ...noCard });
    expect(r.totalCents).toBe(600);
  });

  it("three units pay for two — the free one needs the full group in the basket", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 300, count: 3, ...noCard });
    expect(r.totalCents).toBe(600);
    expect(r.perUnitCents).toBe(200); // 33 % only at exactly 3
  });

  it("five units pay for four", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 300, count: 5, ...noCard });
    expect(r.totalCents).toBe(1200);
  });

  it("six units pay for four — two full groups", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 300, count: 6, ...noCard });
    expect(r.totalCents).toBe(1200);
  });
});

describe("SECOND_UNIT_DISCOUNT — le 2e à 50 %", () => {
  const mech = { kind: "SECOND_UNIT_DISCOUNT", percent: 50 } as const;

  it("one unit pays full price", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 400, count: 1, ...noCard });
    expect(r.totalCents).toBe(400);
    expect(r.applied).toBe(false);
  });

  it("two units = 1.5 × price", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 400, count: 2, ...noCard });
    expect(r.totalCents).toBe(600);
  });

  it("three units = 2 full + 1 half", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 400, count: 3, ...noCard });
    expect(r.totalCents).toBe(1000);
  });
});

describe("LOYALTY_PRICE — prix carte", () => {
  const mech = { kind: "LOYALTY_PRICE", promoPriceCents: 199 } as const;

  it("does not apply without the card", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 289, count: 2, ...noCard });
    expect(r.totalCents).toBe(578);
    expect(r.applied).toBe(false);
    expect(r.requiresLoyalty).toBe(true);
  });

  it("applies with the card", () => {
    const r = effectiveCost({ mechanism: mech, unitPriceCents: 289, count: 2, ...card });
    expect(r.totalCents).toBe(398);
    expect(r.requiresLoyalty).toBe(false);
  });
});

describe("basket-level credits", () => {
  it("LOYALTY_CREDIT reports credit once, not per unit", () => {
    const r = effectiveCost({ mechanism: { kind: "LOYALTY_CREDIT", creditCents: 500 }, unitPriceCents: 300, count: 4, ...card });
    expect(r.totalCents).toBe(1200);
    expect(r.basketCreditCents).toBe(500);
  });

  it("LOYALTY_CREDIT requires the card", () => {
    const r = effectiveCost({ mechanism: { kind: "LOYALTY_CREDIT", creditCents: 500 }, unitPriceCents: 300, count: 4, ...noCard });
    expect(r.basketCreditCents).toBe(0);
    expect(r.requiresLoyalty).toBe(true);
  });

  it("COUPON reports its discount for the basket", () => {
    const r = effectiveCost({ mechanism: { kind: "COUPON", discountCents: 150, minBasketCents: 2000 }, unitPriceCents: 300, count: 1, ...noCard });
    expect(r.basketCreditCents).toBe(150);
  });
});

describe("promotion validity windows", () => {
  it("classifies active / upcoming / expired / unknown", () => {
    expect(promotionState({ validFrom: "2026-09-01", validUntil: "2026-09-07" }, "2026-09-04")).toBe("active");
    expect(promotionState({ validFrom: "2026-09-05", validUntil: "2026-09-11" }, "2026-09-04")).toBe("upcoming");
    expect(promotionState({ validFrom: "2026-08-01", validUntil: "2026-08-31" }, "2026-09-04")).toBe("expired");
    expect(promotionState({ validFrom: null, validUntil: null }, "2026-09-04")).toBe("unknown");
  });

  it("the last validity day is still active", () => {
    expect(promotionState({ validFrom: "2026-08-30", validUntil: "2026-09-04" }, "2026-09-04")).toBe("active");
  });
});

describe("savings vs regular price", () => {
  it("computes honest savings for an activated multi-buy", () => {
    const s = savingsCents(
      { mechanism: { kind: "MULTIBUY", bundleQty: 2, bundlePriceCents: 500 }, unitPriceCents: 320, count: 2, ...noCard },
      320,
    );
    expect(s).toBe(140);
  });

  it("reports zero savings when the mechanism does not activate", () => {
    const s = savingsCents(
      { mechanism: { kind: "BUY_X_GET_Y", buyQty: 2, freeQty: 1 }, unitPriceCents: 300, count: 1, ...noCard },
      300,
    );
    expect(s).toBe(0);
  });
});
