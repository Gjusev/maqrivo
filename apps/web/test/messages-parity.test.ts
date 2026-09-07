import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");

type Messages = Record<string, Record<string, unknown>>;

function loadLocale(locale: string): Messages {
  return JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8"));
}

/** Every leaf path below (and including) `value`, as dotted "namespace.key" strings. */
function leafKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

const en = loadLocale("en");
const fr = loadLocale("fr");

describe("messages parity (en/fr)", () => {
  it("declares the same top-level namespaces", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it("declares the same leaf keys in every namespace", () => {
    for (const namespace of Object.keys(en)) {
      expect(leafKeys(fr[namespace]), `namespace: ${namespace}`).toEqual(leafKeys(en[namespace]));
    }
  });
});
