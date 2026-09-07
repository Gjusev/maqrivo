import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Plan 010: ownership-scoping drift guards. The repo has no DB-backed
 * two-user action harness, so these pin the security-relevant lines at the
 * source level (catalogue-confirm.test.ts style): each assert names the
 * hardening a refactor would silently drop.
 */

const PLANS_ACTIONS = readFileSync(new URL("../src/server/plans/actions.ts", import.meta.url), "utf8");
const CATALOGUES_ACTIONS = readFileSync(new URL("../src/server/catalogues/actions.ts", import.meta.url), "utf8");
const RECEIPTS_ACTIONS = readFileSync(new URL("../src/server/receipts/actions.ts", import.meta.url), "utf8");
const AI_ACTIONS = readFileSync(new URL("../src/server/ai/actions.ts", import.meta.url), "utf8");

/** Source text of one function: from its signature to the next top-level declaration. */
function fnSection(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start === -1) return "";
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:export |const |async function |function )/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

describe("plan 010 ownership scoping (source drift guards)", () => {
  it("joins plan mutations to the owning user (mealPlan + shoppingPlan)", () => {
    expect(PLANS_ACTIONS).toContain("eq(mealPlan.userId");
    expect(PLANS_ACTIONS).toContain("eq(shoppingPlan.userId");
  });

  it("session-gates getPageCandidates", () => {
    expect(fnSection(CATALOGUES_ACTIONS, "export async function getPageCandidates")).toContain("getSessionContext");
  });

  it("scopes getReceiptLines to the owning user's receipt", () => {
    expect(fnSection(RECEIPTS_ACTIONS, "export async function getReceiptLines")).toContain(
      "userId !== session.userId",
    );
  });

  it("pins assistant history roles to user|assistant", () => {
    expect(AI_ACTIONS).toContain('z.enum(["user", "assistant"])');
  });
});
