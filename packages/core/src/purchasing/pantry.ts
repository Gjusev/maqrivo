/**
 * Pantry deduction: what a meal plan actually needs to buy after accounting
 * for consumable pantry stock. Expired stock never counts.
 */
import type { ShelfLifeClass } from "./packages";

export interface PantryStock {
  readonly conceptId: string;
  readonly quantityBase: number; // g / ml / units remaining
  /** ISO date; stock expiring before the plan's consumption window is ignored. */
  readonly expiresOn: string | null;
}

export interface ConceptRequirement {
  readonly conceptId: string;
  readonly quantityBase: number;
  readonly shelfLifeClass: ShelfLifeClass;
}

/**
 * Weekly needs minus consumable pantry stock. Stock already expired at plan
 * start never counts; stock expiring mid-plan counts (using it before it
 * turns is exactly what meal planning is for — the solver sequences that).
 */
export function netRequirements(
  weekly: readonly ConceptRequirement[],
  pantry: readonly PantryStock[],
  consumptionStartIso: string,
): ConceptRequirement[] {
  const available = new Map<string, number>();
  for (const item of pantry) {
    if (item.quantityBase <= 0) continue;
    if (item.expiresOn !== null && item.expiresOn < consumptionStartIso) continue;
    available.set(item.conceptId, (available.get(item.conceptId) ?? 0) + item.quantityBase);
  }
  return weekly.map((req) => {
    const have = available.get(req.conceptId) ?? 0;
    const use = Math.min(have, req.quantityBase);
    if (use > 0) {
      available.set(req.conceptId, have - use);
    }
    return { ...req, quantityBase: Math.max(0, Math.round((req.quantityBase - use) * 1000) / 1000) };
  });
}
