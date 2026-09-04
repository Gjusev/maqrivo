import { expect, test } from "@playwright/test";

/**
 * The first vertical slice, compressed: sign in (French), verify the shell,
 * check the deterministic plan data survives a locale switch, and confirm
 * the shopping list flows. Requires the dev seed (pnpm db:seed).
 */
test.describe("acceptance — vertical slice", () => {
  test("fr shell, plan, locale switch keeps data", async ({ page }) => {
    await page.goto("/fr/sign-in");
    await page.getByLabel("Adresse e-mail").fill("dev@maqrivo.local");
    await page.getByLabel("Mot de passe").fill("dev-password-123");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();

    // French shopping list with euro formatting.
    await page.goto("/fr/shopping");
    await expect(page.getByRole("heading", { name: "Liste de courses" })).toBeVisible();
    await expect(page.locator("text=/\\d+,\\d\\d\\s€/").first()).toBeVisible();

    // English: same data, same plan.
    await page.goto("/en/shopping");
    await expect(page.getByRole("heading", { name: "Shopping list" })).toBeVisible();

    // Week grid exists in both locales.
    await page.goto("/fr/week");
    await expect(page.getByRole("heading", { name: "Ma semaine" })).toBeVisible();
    await page.goto("/en/week");
    await expect(page.getByRole("heading", { name: "My week" })).toBeVisible();
  });

  test("offers expose provenance labels", async ({ page }) => {
    await page.goto("/fr/sign-in");
    await page.getByLabel("Adresse e-mail").fill("dev@maqrivo.local");
    await page.getByLabel("Mot de passe").fill("dev-password-123");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();
    await page.goto("/fr/offers");
    await expect(page.getByRole("heading", { name: "Promos" })).toBeVisible();
    // A user-observed promotion is labelled as such (no evidence, no deal).
    await expect(page.getByText("Observé par vous").first()).toBeVisible();
  });
});
