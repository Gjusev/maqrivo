import { expect, test, type Page } from "@playwright/test";

/**
 * Catalogue flow, frozen end-to-end against the dev seed data: the Prospectus
 * section on /fr/offers, card → detail navigation (client-side, no
 * networkidle), the page-photo detail (back link, page image, extract button —
 * never clicked: paid AI), the zoom lightbox, the honest structured-catalogue
 * copy, and the signed-out redirect. Requires a running server with the dev
 * seed (see playwright.config.ts — no webServer block).
 *
 * Catalogue rows are created with random ids, so nothing here hardcodes a
 * uuid: tests navigate by card text and by the "N pages" badge that the
 * /fr/offers/catalogues list renders for photo leaflets (structured
 * catalogues have no pages and therefore no badge).
 */

/** Detail URL captured by the card-click test; reused by the signed-out test. */
let catalogueDetailUrl = "";

async function signIn(page: Page): Promise<void> {
  await page.goto("/fr/sign-in");
  await page.getByLabel("Adresse e-mail").fill("dev@maqrivo.local");
  await page.getByLabel("Mot de passe").fill("dev-password-123");
  // Better Auth caps /sign-in/email at 10 requests / 10 s / IP; a serial
  // two-project run (this spec plus acceptance.spec.ts) can outrun that, so
  // back off past the window and retry before giving up.
  const limitNote = page.getByText("Trop de tentatives");
  const home = page.getByRole("heading", { name: "Aujourd'hui" });
  await page.getByRole("button", { name: "Se connecter" }).click();
  // Whichever lands first: the rate-limit note or the signed-in home page.
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(home.or(limitNote).first()).toBeVisible({ timeout: 8000 });
    if (!(await limitNote.isVisible())) return;
    await page.waitForTimeout(11_000);
    await page.getByRole("button", { name: "Se connecter" }).click();
  }
  await expect(home).toBeVisible();
}

test.describe.serial("catalogues — catalogue flow", () => {
  test("offers page: Prospectus section, filter chips, dynamic view-all", async ({ page }) => {
    await signIn(page);
    await page.goto("/fr/offers");
    await expect(page.getByRole("heading", { name: "Promos" })).toBeVisible();

    // The Prospectus section with at least one catalogue card.
    await expect(page.getByRole("heading", { name: "Prospectus" })).toBeVisible();
    const catalogueCards = page.getByRole("list").first().getByRole("listitem");
    expect(await catalogueCards.count()).toBeGreaterThanOrEqual(1);

    // Scope chips: "Mes magasins" is the default (aria-pressed), "Tous" is not.
    const mineChip = page.getByRole("button", { name: "Mes magasins" });
    const allChip = page.getByRole("button", { name: "Tous", exact: true });
    await expect(mineChip).toBeVisible();
    await expect(allChip).toBeVisible();
    await expect(mineChip).toHaveAttribute("aria-pressed", "true");
    await expect(allChip).toHaveAttribute("aria-pressed", "false");

    // The offers page surfaces at most ten catalogues; the view-all link
    // appears only when more exist. Below the cap its absence is guaranteed;
    // exactly at the cap the total is not derivable from the UI, so accept
    // either state but freeze the link's visibility when present.
    const viewAll = page.getByRole("link", { name: /Tous les prospectus/ });
    const shownCards = await catalogueCards.count();
    if (shownCards < 10) {
      await expect(viewAll).toHaveCount(0);
    } else if ((await viewAll.count()) > 0) {
      await expect(viewAll).toBeVisible();
    }
  });

  test("catalogue card click navigates to the detail page", async ({ page }) => {
    await signIn(page);
    await page.goto("/fr/offers");
    const carrefourCard = page.getByRole("link", { name: /Carrefour/ }).first();
    await expect(carrefourCard).toBeVisible();

    // Client-side navigation — wait for the URL, not for network idle.
    await carrefourCard.click();
    await page.waitForURL(/offers\/catalogues\/./, { timeout: 10000 });
    expect(page.url()).toMatch(/offers\/catalogues\/[0-9a-f-]{36}/);

    catalogueDetailUrl = page.url();
  });

  test("photo catalogue detail: back link, page image, extract button", async ({ page }) => {
    await signIn(page);
    // Pick a catalogue that actually has page photos (badge "N pages").
    await page.goto("/fr/offers/catalogues");
    const withPagesCard = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link") })
      .filter({ hasText: /pages/ })
      .first();
    expect(await withPagesCard.count()).toBeGreaterThanOrEqual(1);
    await withPagesCard.getByRole("link").click();
    await page.waitForURL(/offers\/catalogues\/./, { timeout: 10000 });

    await expect(page.getByRole("link", { name: "← Retour" })).toBeVisible();
    await expect(page.locator("img[src*='/api/catalogues/pages/']").first()).toBeVisible();
    // Visible but NEVER clicked: extraction is a paid AI call.
    await expect(page.getByRole("button", { name: "Extraire les offres" }).first()).toBeVisible();
  });

  test("page image opens the lightbox; Escape closes it", async ({ page }) => {
    await signIn(page);
    await page.goto("/fr/offers/catalogues");
    const withPagesCard = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link") })
      .filter({ hasText: /pages/ })
      .first();
    await withPagesCard.getByRole("link").click();
    await page.waitForURL(/offers\/catalogues\/./, { timeout: 10000 });
    await page.locator("img[src*='/api/catalogues/pages/']").first().click();
    const lightbox = page.getByRole("dialog");
    await expect(lightbox).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("structured catalogue shows the honest no-photos copy", async ({ page }) => {
    await signIn(page);
    await page.goto("/fr/offers/catalogues");
    // Structured catalogues have zero pages, hence no "N pages" badge.
    const structuredCard = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link") })
      .filter({ hasNotText: /pages/ })
      .first();
    expect(await structuredCard.count()).toBeGreaterThanOrEqual(1);
    await structuredCard.getByRole("link").click();
    await page.waitForURL(/offers\/catalogues\/./, { timeout: 10000 });

    // The apostrophe in "l'enseigne" is avoided via a wildcard so the
    // assertion survives quote-style changes in the message files.
    await expect(page.getByText(/proviennent directement des données de l.enseigne/)).toBeVisible();
  });

  test("signed-out catalogue URL redirects to sign-in", async ({ page }) => {
    expect(catalogueDetailUrl, "card-click test must run first (serial)").toBeTruthy();
    // Fresh context: no sign-in — the (app) layout must gate the detail URL.
    await page.goto(catalogueDetailUrl);
    await expect(page).toHaveURL(/sign-in/);
  });
});
