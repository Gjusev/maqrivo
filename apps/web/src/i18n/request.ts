import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import * as rootParams from "next/root-params";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const segment = await rootParams.locale();
    locale = hasLocale(routing.locales, segment) ? segment : undefined;
  }
  if (!locale) locale = routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
