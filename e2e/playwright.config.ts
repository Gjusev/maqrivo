import { defineConfig } from "@playwright/test";

/**
 * E2E runs against a running dev/prod instance with seeded dev data.
 * AUTH: tests sign in as dev@maqrivo.local via the UI.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fr-FR",
    viewport: { width: 390, height: 844 }, // mobile-first
  },
  projects: [
    { name: "fr-mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "en-desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
