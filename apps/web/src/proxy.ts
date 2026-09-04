import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Locale negotiation (browser detection → cookie → path). Next 16: proxy.ts. */
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
