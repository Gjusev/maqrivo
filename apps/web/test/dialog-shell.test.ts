import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const tsxFiles = walk(srcDir)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => ({ path: relative(srcDir, file).split(sep).join("/") }));

const REFACTORED = [
  "app/[locale]/(app)/offers/new-promotion-button.tsx",
  "app/[locale]/(app)/offers/catalogues/new-catalogue-button.tsx",
  "app/[locale]/(app)/recipes/generate-recipe-button.tsx",
];

/**
 * Components that own a fullscreen overlay shell by design: the shared Dialog,
 * the image Lightbox, and the app-shell mobile menu drawer (a bottom sheet with
 * safe-area padding that predates Dialog and keeps its own layout).
 */
const SHELL_COMPONENTS = ["components/app-shell.tsx", "components/dialog.tsx", "components/lightbox.tsx"];

describe("dialog shell drift guard", () => {
  it("refactored modals render through the shared Dialog", () => {
    for (const path of REFACTORED) {
      expect(readFileSync(join(srcDir, path), "utf8"), path).toContain('from "@/components/dialog"');
    }
  });

  it("leaves no hand-rolled fixed inset-0 overlay under the app tree", () => {
    expect(
      tsxFiles
        .filter(({ path }) => path.startsWith("app/") && readFileSync(join(srcDir, path), "utf8").includes("fixed inset-0"))
        .map(({ path }) => path),
    ).toEqual([]);
  });

  it("keeps fullscreen overlays confined to the shell components", () => {
    expect(
      tsxFiles
        .filter(
          ({ path }) =>
            path.startsWith("components/") && readFileSync(join(srcDir, path), "utf8").includes("fixed inset-0"),
        )
        .map(({ path }) => path)
        .sort(),
    ).toEqual(SHELL_COMPONENTS);
  });
});
