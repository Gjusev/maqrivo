/**
 * Deterministic auto-confirm for vision candidates (plan 006). The manual
 * path treats AI output as review-only; this gate auto-promotes a candidate
 * ONLY when every signal is as deterministic as the structured-ingest path
 * (catalogue-sync.ts ingestStructuredItems):
 *   1. price parsed non-null (promoPriceCents or pricePerKgCents), plus
 *      discountPct when the mechanism is PERCENTAGE_OFF (plan 002);
 *   2. validUntil read from the printed leaflet date — never the 9-day
 *      heuristic that hydrates review candidates;
 *   3. product match state EXACT (EAN/barcode-deterministic).
 * Everything else stays a review candidate. Loosening this gate is a policy
 * decision, not a refactor.
 *
 * Product-match state only exists post-insert (`tryMatchPromotionProduct`
 * reads the promotion row), so promotion follows the insert-then-check
 * route: insert with confidence MEDIUM / verification EXTRACTED, run the
 * matcher, and DELETE the row unless the final decision is "ok" — nothing
 * below the evidence bar is ever left standing as auto-truth. The natural-
 * key dedup from confirmCandidateAction runs BEFORE the insert, so a
 * re-extraction can never double-insert.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ProductCandidate } from "@maqrivo/core";
import { db } from "../db";
import { catalogue, cataloguePage, promotion, promotionProductMatch, sourceEvidence } from "@maqrivo/db";
import { tryMatchPromotionProduct } from "../ingestion/promotions";
import type { CatalogueCandidate } from "./extraction";

export type ProductMatchState = "EXACT" | "PROBABLE" | "AMBIGUOUS" | "UNRESOLVED" | null;

export interface AutoConfirmDecision {
  promotable: boolean;
  reason: "no-price" | "no-date" | "no-match" | "ok";
}

/** Strict, deterministic-only gate (never fuzzy). Checks run in order; the first failing reason wins. */
export function autoConfirmDecision(
  candidate: CatalogueCandidate,
  matchState: ProductMatchState,
): AutoConfirmDecision {
  const priced =
    (candidate.promoPriceCents != null || candidate.pricePerKgCents != null) &&
    (candidate.mechanism !== "PERCENTAGE_OFF" || candidate.discountPct != null);
  if (!priced) return { promotable: false, reason: "no-price" };
  if (candidate.validUntil == null) return { promotable: false, reason: "no-date" };
  if (matchState !== "EXACT") return { promotable: false, reason: "no-match" };
  return { promotable: true, reason: "ok" };
}

export type PromoteCandidateResult =
  | { ok: true; promotionId: string; duplicate: boolean }
  | { ok: false; reason: "no-price" | "no-date" | "no-match" };

/**
 * Auto-promote one candidate from an extracted page. Idempotent: the dedup
 * pre-check returns the existing promotion id without re-inserting. Throws
 * only on infrastructure errors (catalogue vanished mid-run, DB down) — the
 * caller isolates per-candidate failures.
 */
export async function promoteCandidate(
  candidate: CatalogueCandidate,
  pageContext: { catalogueId: string; pageId: string },
  productCandidates?: ProductCandidate[],
): Promise<PromoteCandidateResult> {
  // Pre-insert legs: "EXACT" can never fail the match leg, so this isolates
  // the pure price/date checks — no row is created for a candidate that can
  // never pass the gate.
  const cheap = autoConfirmDecision(candidate, "EXACT");
  if (!cheap.promotable && cheap.reason !== "ok") return { ok: false, reason: cheap.reason };

  const catRow = (
    await db
      .select({ cat: catalogue, page: cataloguePage })
      .from(catalogue)
      .leftJoin(cataloguePage, eq(cataloguePage.id, pageContext.pageId))
      .where(eq(catalogue.id, pageContext.catalogueId))
      .limit(1)
  )[0];
  if (!catRow) throw new Error("catalogue-not-found");

  // Natural-key dedup (page + description + price), same shape as
  // confirmCandidateAction: a re-extraction or a double sweep run must not
  // insert twice. Treated as success by the caller.
  const duplicate = (
    await db
      .select({ id: promotion.id })
      .from(promotion)
      .where(
        and(
          eq(promotion.cataloguePageId, pageContext.pageId),
          eq(promotion.descriptionRaw, candidate.description),
          candidate.promoPriceCents != null
            ? eq(promotion.promoPriceCents, candidate.promoPriceCents)
            : isNull(promotion.promoPriceCents),
        ),
      )
      .limit(1)
  )[0];
  if (duplicate) return { ok: true, promotionId: duplicate.id, duplicate: true };

  // Evidence: the page photo itself, resolved via its storageKey (set at
  // upload or sync) — same lookup as confirmCandidateAction.
  const evidence = catRow.page?.imageKey
    ? (await db.select().from(sourceEvidence).where(eq(sourceEvidence.storageKey, catRow.page.imageKey)).limit(1))[0]
    : undefined;

  const inserted = (
    await db
      .insert(promotion)
      .values({
        retailerId: catRow.cat.retailerId,
        catalogueId: catRow.cat.id,
        storeId: catRow.cat.storeId ?? null,
        descriptionRaw: candidate.description,
        brand: candidate.brand ?? null,
        regularPriceCents: candidate.regularPriceCents ?? null,
        promoPriceCents: candidate.promoPriceCents ?? null,
        pricePerKgCents: candidate.pricePerKgCents ?? null,
        mechanism: candidate.mechanism === "OTHER" ? "PROMO_PRICE" : candidate.mechanism,
        minQty: candidate.bundleQty ?? null,
        payQty: candidate.bundleQty ?? null,
        discountPct: candidate.discountPct ?? null,
        loyaltyRequired: candidate.loyalty,
        validFrom: catRow.cat.validFrom ?? null,
        validUntil: candidate.validUntil,
        source: "catalogue",
        // Same posture as a user confirm minus the human: extracted from
        // the leaflet photo, one confidence notch below it.
        verification: "EXTRACTED",
        confidence: "MEDIUM",
        cataloguePageId: catRow.page?.id ?? null,
        evidenceId: evidence?.id ?? null,
        createdByUserId: null, // system promotion — no user to attribute
      })
      .returning()
  )[0]!;

  // The matcher reads the promotion row — hence insert-then-check. One
  // product-catalog load is shared across the whole sweep batch.
  await tryMatchPromotionProduct(inserted.id, null, candidate.brand ?? null, candidate.description, productCandidates);
  const match = (
    await db
      .select({ state: promotionProductMatch.state })
      .from(promotionProductMatch)
      .where(eq(promotionProductMatch.promotionId, inserted.id))
      .orderBy(desc(promotionProductMatch.decidedAt))
      .limit(1)
  )[0];

  const decision = autoConfirmDecision(candidate, match?.state ?? null);
  if (!decision.promotable && decision.reason !== "ok") {
    // Roll the insert back (match rows cascade on delete): PROBABLE,
    // AMBIGUOUS and UNRESOLVED must not survive as auto-truth.
    await db.delete(promotion).where(eq(promotion.id, inserted.id));
    return { ok: false, reason: decision.reason };
  }
  return { ok: true, promotionId: inserted.id, duplicate: false };
}
