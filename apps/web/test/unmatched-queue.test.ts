import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 'Unmatched deals' review queue. The eligibility predicate is pure and real;
 * the resolve action is guarded at the source level (action-scoping.test.ts
 * style) because the repo has no DB-backed two-user action harness.
 */

// The module graph reaches server/db, which requires DATABASE_URL at import
// time. The pg pool connects lazily and nothing here queries, so a
// placeholder is enough to import the pure pieces.
process.env.DATABASE_URL ??= "postgres://maqrivo:maqrivo@localhost:5432/maqrivo";
const { isUnmatchedEligible } = await import("../src/server/offers/unmatched");

const UNMATCHED_ACTIONS = readFileSync(new URL("../src/server/offers/unmatched-actions.ts", import.meta.url), "utf8");
const UNMATCHED = readFileSync(new URL("../src/server/offers/unmatched.ts", import.meta.url), "utf8");

/** Source text of one function: from its signature to the next top-level declaration. */
function fnSection(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start === -1) return "";
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:export |const |async function |function )/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

const RESOLVE = fnSection(UNMATCHED, "export async function resolvePromotionMatch");
const LIST = fnSection(UNMATCHED, "export async function listUnmatchedPromotions");

describe("isUnmatchedEligible (unexpired + UNRESOLVED)", () => {
  const today = "2026-09-07";

  it("keeps an UNRESOLVED promotion still on sale", () => {
    expect(isUnmatchedEligible({ matchState: "UNRESOLVED", verification: "NEEDS_VERIFICATION", validUntil: "2026-09-10" }, today)).toBe(
      true,
    );
  });

  it("keeps an UNRESOLVED promotion with no end date", () => {
    expect(isUnmatchedEligible({ matchState: "UNRESOLVED", verification: "USER_OBSERVED", validUntil: null }, today)).toBe(true);
  });

  it("drops an UNRESOLVED promotion whose validUntil has passed", () => {
    expect(isUnmatchedEligible({ matchState: "UNRESOLVED", verification: "NEEDS_VERIFICATION", validUntil: "2026-09-06" }, today)).toBe(
      false,
    );
  });

  it("drops an expired promotion even with a future validUntil", () => {
    expect(isUnmatchedEligible({ matchState: "UNRESOLVED", verification: "EXPIRED", validUntil: "2026-09-10" }, today)).toBe(false);
  });

  it("drops rows that are not UNRESOLVED (EXACT/PROBABLE/AMBIGUOUS)", () => {
    expect(isUnmatchedEligible({ matchState: "EXACT", verification: "NEEDS_VERIFICATION", validUntil: null }, today)).toBe(false);
    expect(isUnmatchedEligible({ matchState: "AMBIGUOUS", verification: "NEEDS_VERIFICATION", validUntil: null }, today)).toBe(false);
  });
});

describe("resolve action scoping (source drift guards)", () => {
  it("is a session-gated server action", () => {
    expect(UNMATCHED_ACTIONS).toContain('"use server"');
    const action = fnSection(UNMATCHED_ACTIONS, "export async function resolvePromotionMatchAction");
    expect(action).toContain("getSessionContext");
    expect(action).toContain('"unauthorized"');
  });

  it("zod-validates both ids before touching the db", () => {
    expect(RESOLVE).toContain("resolveMatchSchema.safeParse(input)");
    expect(UNMATCHED).toContain('z.object({ promotionId: z.uuid(), productId: z.uuid() })');
  });

  it("only flips rows whose match state is UNRESOLVED", () => {
    expect(RESOLVE).toContain('eq(promotionProductMatch.state, "UNRESOLVED")');
    expect(RESOLVE).toContain("isUnmatchedEligible(row, today)");
  });

  it("scopes the target product to global or user-owned rows", () => {
    expect(RESOLVE).toContain("isNull(product.ownerUserId)");
    expect(RESOLVE).toContain("eq(product.ownerUserId, userId)");
  });

  it("lands on EXACT with user provenance and refreshes the queue", () => {
    expect(RESOLVE).toContain('state: "EXACT"');
    expect(RESOLVE).toContain('decidedBy: "user"');
    expect(RESOLVE).toContain('revalidatePath("/offers")');
  });

  it("lists the queue soonest-expiry-first with a total count", () => {
    expect(LIST).toContain("asc nulls last");
    expect(LIST).toContain("count(*)::int");
  });
});
