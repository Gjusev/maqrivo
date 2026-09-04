import { defineRouting } from "next-intl/routing";

/** Locales are presentation only — they never appear in domain data. */
export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localePrefix: "always",
});
