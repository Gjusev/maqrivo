/**
 * ProductResolution: match an external/textual product reference to known
 * products. Deterministic signals first — exact identifiers, then a scored
 * combination of brand, normalized name, and packaging. UNRESOLVED is a
 * valid, preferred outcome over a wrong match.
 */
import { similarity } from "./normalize";

export type ResolutionState = "EXACT" | "PROBABLE" | "AMBIGUOUS" | "UNRESOLVED";
export type MatchedBy = "barcode" | "retailer_id" | "brand_name_packaging" | "none";

export interface ProductCandidate {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly barcode: string | null;
  readonly retailerProductIds: Readonly<Record<string, string>>; // retailer → id
  readonly packageQuantity: number | null;
  readonly packageUnit: string | null;
}

export interface ExternalProductRef {
  readonly name: string;
  readonly brand: string | null;
  readonly barcode: string | null;
  readonly retailerId: string | null; // e.g. "carrefour"
  readonly retailerProductId: string | null;
  readonly packageQuantity: number | null;
  readonly packageUnit: string | null;
}

export interface Resolution {
  readonly state: ResolutionState;
  readonly productId: string | null;
  readonly matchedBy: MatchedBy;
  /** Deterministic 0..1 score for scored matches; 1 for identifier matches. */
  readonly score: number;
  /** The tied best candidates when AMBIGUOUS. */
  readonly tiedCandidates: readonly string[];
}

const PROBABLE_THRESHOLD = 0.75;
const AMBIGUITY_GAP = 0.05;

export function resolveProduct(
  ref: ExternalProductRef,
  candidates: readonly ProductCandidate[],
): Resolution {
  // 1. Barcode: exact, decisive.
  if (ref.barcode !== null) {
    const hit = candidates.find((c) => c.barcode === ref.barcode);
    if (hit) {
      return { state: "EXACT", productId: hit.id, matchedBy: "barcode", score: 1, tiedCandidates: [] };
    }
  }
  // 2. Retailer product id: exact within that retailer's namespace.
  if (ref.retailerId !== null && ref.retailerProductId !== null) {
    const hit = candidates.find(
      (c) => c.retailerProductIds[ref.retailerId ?? ""] === ref.retailerProductId,
    );
    if (hit) {
      return { state: "EXACT", productId: hit.id, matchedBy: "retailer_id", score: 1, tiedCandidates: [] };
    }
  }
  // 3. Scored: brand + normalized name + packaging.
  const scored = candidates
    .map((c) => ({ id: c.id, score: scoredSimilarity(ref, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const best = scored[0];
  if (!best || best.score < PROBABLE_THRESHOLD) {
    return { state: "UNRESOLVED", productId: null, matchedBy: "none", score: best?.score ?? 0, tiedCandidates: [] };
  }
  const runnerUp = scored[1];
  if (runnerUp && best.score - runnerUp.score < AMBIGUITY_GAP) {
    return {
      state: "AMBIGUOUS",
      productId: null,
      matchedBy: "none",
      score: best.score,
      tiedCandidates: [best.id, runnerUp.id],
    };
  }
  return { state: "PROBABLE", productId: best.id, matchedBy: "brand_name_packaging", score: best.score, tiedCandidates: [] };
}

function scoredSimilarity(ref: ExternalProductRef, candidate: ProductCandidate): number {
  const nameScore = similarity(ref.name, candidate.name);
  const brandScore =
    ref.brand !== null && candidate.brand !== null
      ? similarity(ref.brand, candidate.brand)
      : 0.5; // brand unknown on either side: absence of evidence, not mismatch
              // (receipt labels carry no brand; penalising them would break
              // exactly the till-label → product path)
  const packagingScore =
    ref.packageQuantity !== null &&
    candidate.packageQuantity !== null &&
    ref.packageUnit !== null &&
    candidate.packageUnit !== null
      ? ref.packageQuantity === candidate.packageQuantity && ref.packageUnit === candidate.packageUnit
        ? 1
        : 0
      : 0.5; // packaging unknown on either side: neutral

  // Weighted: name dominates, brand confirms, packaging disambiguates.
  return 0.6 * nameScore + 0.25 * brandScore + 0.15 * packagingScore;
}
