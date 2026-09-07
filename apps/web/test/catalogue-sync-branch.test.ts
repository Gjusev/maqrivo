import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `syncRemoteCatalogues` needs DB + network, so its observable contract is
 * guarded at the source level instead. The original bug: structured-item
 * ingestion ended with an early `continue` that skipped the page-image loop,
 * leaving every synced Lidl/Auchan/Intermarché catalogue an empty shell.
 */

const SYNC_SOURCE = readFileSync(
  new URL("../src/server/ingestion/catalogue-sync.ts", import.meta.url),
  "utf8",
);

describe("catalogue sync branch (source drift guard)", () => {
  it("structured catalogues still fetch pages", () => {
    const ingestIdx = SYNC_SOURCE.indexOf("result.newPromotions += await ingestStructuredItems({");
    expect(ingestIdx).toBeGreaterThanOrEqual(0);

    const loopIdx = SYNC_SOURCE.indexOf("for (const [index, pageUrl]", ingestIdx);
    expect(loopIdx).toBeGreaterThan(ingestIdx);

    // Between ingesting structured items and the page loop there must be no
    // bare `continue;` statement — that skip is exactly the old bug. (The
    // `continue`s inside the page loop sit after `loopIdx` and are fine.)
    const between = SYNC_SOURCE.slice(ingestIdx, loopIdx);
    expect(between.split("\n").some((line) => line.trim() === "continue;")).toBe(false);
  });

  it("structuredOnly message key exists in both locales", () => {
    for (const locale of ["en", "fr"]) {
      const messages = JSON.parse(
        readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"),
      ) as { Catalogues?: Record<string, string> };
      expect(typeof messages.Catalogues?.structuredOnly).toBe("string");
      expect((messages.Catalogues?.structuredOnly ?? "").length).toBeGreaterThan(0);
    }
  });
});
