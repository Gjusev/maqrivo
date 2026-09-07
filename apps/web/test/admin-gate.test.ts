import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAdminUser } from "../src/server/admin";

/**
 * Privilege model: the FIRST registered account is the admin — it gates
 * ingestion job triggering and global-catalog mutations. The repo has no
 * DB-backed two-user action harness (server/db.ts throws without
 * DATABASE_URL at import time), so the wiring is pinned at the source level
 * (action-scoping.test.ts style): each assert names the gate a refactor
 * would silently drop.
 */

const SESSION = readFileSync(new URL("../src/server/session.ts", import.meta.url), "utf8");
const INGESTION_ACTIONS = readFileSync(
  new URL("../src/app/[locale]/admin/ingestion/actions.ts", import.meta.url),
  "utf8",
);
const PRODUCTS_ACTIONS = readFileSync(new URL("../src/server/products/actions.ts", import.meta.url), "utf8");

/** Source text of one function: from its signature to the next top-level declaration. */
function fnSection(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start === -1) return "";
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:export |const |async function |function )/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

describe("isAdminUser predicate (first registered account is admin)", () => {
  it("matches only the earliest-created user id", () => {
    expect(isAdminUser("u-earliest", "u-earliest")).toBe(true);
    expect(isAdminUser("u-later", "u-earliest")).toBe(false);
  });

  it("rejects a missing session and an empty user table", () => {
    expect(isAdminUser(null, "u-earliest")).toBe(false);
    expect(isAdminUser(undefined, "u-earliest")).toBe(false);
    expect(isAdminUser("u-earliest", null)).toBe(false);
    expect(isAdminUser("u-earliest", undefined)).toBe(false);
  });
});

describe("admin gate wiring (source drift guards)", () => {
  it("session.ts exports isAdmin, derived from the earliest created_at", () => {
    expect(SESSION).toContain("export async function isAdmin");
    expect(SESSION).toContain("orderBy(asc(userTable.createdAt), asc(userTable.id))");
    expect(SESSION).toContain("cachedEarliestUserId === undefined");
  });

  it("triggerJobAction requires an admin next to the session check", () => {
    const fn = fnSection(INGESTION_ACTIONS, "export async function triggerJobAction");
    expect(fn).toContain("getSessionContext");
    expect(fn).toContain("await isAdmin()");
  });

  it("global catalog mutations reject non-admins with forbidden", () => {
    for (const signature of [
      "export async function setProductConceptAction",
      "export async function setHalalStateAction",
    ]) {
      const fn = fnSection(PRODUCTS_ACTIONS, signature);
      expect(fn).toContain("await isAdmin()");
      expect(fn).toContain('error: "forbidden"');
    }
  });

  it("per-user product creation stays open to its owner (no admin gate)", () => {
    const fn = fnSection(PRODUCTS_ACTIONS, "export async function createProductAction");
    expect(fn).toContain("ownerUserId: session.userId");
    expect(fn).not.toContain("isAdmin");
  });
});
