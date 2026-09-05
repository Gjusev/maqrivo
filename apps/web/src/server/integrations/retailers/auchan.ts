/**
 * Auchan adapter — official catalogue pages are public server-rendered HTML.
 * Product zones contain prices as text attributes and page-image URLs, so
 * eligible offers can be parsed without browser automation or OCR.
 */
import { politeFetchText } from "../http";
import { registerFlipbook, type RemoteCatalogue, type RemoteCatalogueItem } from "./flipbook";
import { cleanHtmlText, decimalEurosToCents, htmlAttributes } from "./html";

const SOURCE = "auchan";
const LIST_URL = "https://www.auchan.fr/catalogue/";
const MAX_CATALOGUES = 3;
const MONEY = String.raw`(\d+(?:[.,]\s*\d{1,2})?)\s*€\s*(\d{1,2})?`;

export interface AuchanCatalogueRef {
  readonly externalId: string;
  readonly title: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly detailUrl: string;
}

function parisDateFromEpoch(value: string | undefined): string | null {
  if (!value || !/^\d{10,13}$/.test(value)) return null;
  const milliseconds = value.length === 10 ? Number(value) * 1_000 : Number(value);
  if (!Number.isFinite(milliseconds)) return null;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(milliseconds));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function catalogueScore(title: string, status: string): number {
  let score = /en ce moment/i.test(status) ? 5 : 0;
  if (/promo|prix|bon\s*plan|top/i.test(title)) score += 4;
  if (/electro|para|beaut|déco|deco|vêtement|vetement|bijou|scolaire|étudiant/i.test(title)) score -= 20;
  return score;
}

export function auchanCatalogueRefsFromHtml(html: string): AuchanCatalogueRef[] {
  const refs: Array<AuchanCatalogueRef & { score: number; order: number }> = [];
  const articles = html.match(/<article\b[^>]*data-catalog-id=["'][^"']+["'][\s\S]*?<\/article>/gi) ?? [];
  for (const [order, article] of articles.entries()) {
    const startTag = article.match(/^<article\b[^>]*>/i)?.[0];
    if (!startTag) continue;
    const attributes = htmlAttributes(startTag);
    const href = /href=["'](?<href>\/catalogue\/[^"']+)["']/i.exec(article)?.groups?.href;
    const designation = href?.match(/^\/catalogue\/([^?]+)/i)?.[1];
    if (!href || !designation) continue;
    const title = cleanHtmlText(attributes["data-catalog-name"]) || null;
    refs.push({
      externalId: designation,
      title,
      validFrom: parisDateFromEpoch(attributes["data-catalog-start"]),
      validUntil: parisDateFromEpoch(attributes["data-catalog-end"]),
      detailUrl: new URL(href, LIST_URL).toString(),
      score: catalogueScore(title ?? "", attributes["data-catalog-status"] ?? ""),
      order,
    });
  }
  return refs
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((ref) => ({
      externalId: ref.externalId,
      title: ref.title,
      validFrom: ref.validFrom,
      validUntil: ref.validUntil,
      detailUrl: ref.detailUrl,
    }));
}

function moneyMatchToCents(match: RegExpExecArray | null, wholeIndex: number): number | null {
  if (!match) return null;
  const whole = match[wholeIndex];
  const suffix = match[wholeIndex + 1];
  return decimalEurosToCents(suffix && whole && !/[.,]/.test(whole) ? `${whole}.${suffix}` : whole);
}

export function auchanOfferPrices(title: string, description: string): {
  priceCents: number | null;
  regularPriceCents: number | null;
  pricePerKgCents: number | null;
  mechanism?: RemoteCatalogueItem["mechanism"];
  minQty?: number | null;
  payQty?: number | null;
  getQty?: number | null;
  discountPct?: number | null;
} {
  const grouped = new RegExp(`(?:Par|Les)\\s+(\\d+)\\s*:\\s*${MONEY}`, "i").exec(description);
  const soldAlone = new RegExp(`Vendu\\s+seul\\s*:\\s*${MONEY}`, "i").exec(description);
  const insteadOf = new RegExp(`au\\s+lieu\\s+de\\s*${MONEY}`, "i").exec(description);
  const perKg = new RegExp(`Soit\\s+le\\s+kg\\s*:\\s*${MONEY}`, "i").exec(description);
  const soldAloneCents = moneyMatchToCents(soldAlone, 1);
  const insteadOfCents = moneyMatchToCents(insteadOf, 1);
  const pricePerKgCents = moneyMatchToCents(perKg, 1);

  if (grouped) {
    const quantity = Number.parseInt(grouped[1] ?? "0", 10);
    const total = moneyMatchToCents(grouped, 2);
    if (quantity > 0 && total != null) {
      return {
        priceCents: Math.round(total / quantity),
        regularPriceCents:
          soldAloneCents ?? (insteadOfCents != null ? Math.round(insteadOfCents / quantity) : null),
        pricePerKgCents,
        mechanism: /cagnott|waaoh|compte/i.test(description) ? "LOYALTY_PRICE" : "MULTIBUY",
        minQty: quantity,
      };
    }
  }

  const freeUnits = /(\d+)\s*\+\s*(\d+)\s*offert/i.exec(title);
  if (freeUnits && soldAloneCents != null) {
    const paid = Number.parseInt(freeUnits[1] ?? "0", 10);
    const free = Number.parseInt(freeUnits[2] ?? "0", 10);
    if (paid > 0 && free > 0) {
      return {
        priceCents: Math.round((soldAloneCents * paid) / (paid + free)),
        regularPriceCents: soldAloneCents,
        pricePerKgCents,
        mechanism: "BUY_X_GET_Y",
        minQty: paid + free,
        payQty: paid,
        getQty: free,
      };
    }
  }

  const secondUnit = /(\d+)\s*%[^\n]*(?:2(?:e|ème)|deuxième)/i.exec(title);
  if (secondUnit && soldAloneCents != null) {
    const percentage = Number.parseInt(secondUnit[1] ?? "0", 10);
    if (percentage > 0 && percentage <= 100) {
      return {
        priceCents: Math.round((soldAloneCents * (2 - percentage / 100)) / 2),
        regularPriceCents: soldAloneCents,
        pricePerKgCents,
        mechanism: "SECOND_UNIT_DISCOUNT",
        minQty: 2,
        discountPct: percentage,
      };
    }
  }

  // Per-kg-only descriptions do not reveal the pack's sale price. Keeping
  // them out is more honest than presenting a unit price as a pack price.
  return { priceCents: null, regularPriceCents: null, pricePerKgCents };
}

export function auchanCatalogueFromHtml(
  ref: AuchanCatalogueRef,
  html: string,
): RemoteCatalogue {
  const pageImageUrls: string[] = [];
  const items: RemoteCatalogueItem[] = [];
  let currentPage: number | null = null;
  const tags = html.match(
    /<(?:img|div)\b[^>]*(?:data-src=["'][^"']*\/pages\/\d+\.jpg[^"']*["']|data-product-cui=["'][^"']+["'])[^>]*>/gi,
  ) ?? [];

  for (const tag of tags) {
    const attributes = htmlAttributes(tag);
    const pageUrl = attributes["data-src"];
    const pageNumber = pageUrl?.match(/\/pages\/(\d+)\.jpg/i)?.[1];
    if (pageUrl && pageNumber) {
      currentPage = Number.parseInt(pageNumber, 10);
      pageImageUrls[currentPage - 1] = pageUrl;
      continue;
    }
    if (!attributes["data-product-cui"]) continue;

    const label = cleanHtmlText(attributes["data-title"]);
    const description = cleanHtmlText(attributes["data-description"]);
    if (!label || !description) continue;
    const prices = auchanOfferPrices(label, description);
    if (prices.priceCents == null) continue;
    const packaging = description.split(/\b(?:Soit|Vendu seul|Par\s+\d+|Les\s+\d+)\b/i)[0]?.trim();
    items.push({
      ean: null, // data-product-cui is an Auchan id, not a verified GTIN
      label,
      brand: null,
      priceCents: prices.priceCents,
      regularPriceCents: prices.regularPriceCents,
      pricePerKgCents: prices.pricePerKgCents,
      packaging: packaging || null,
      category: null,
      loyalty: /cagnott|waaoh|compte/i.test(`${label} ${description}`),
      validityText: description,
      mechanism: prices.mechanism,
      minQty: prices.minQty,
      payQty: prices.payQty,
      getQty: prices.getQty,
      discountPct: prices.discountPct,
      conditionsRaw: description,
      page: currentPage,
    });
  }

  return {
    externalId: ref.externalId,
    title: ref.title,
    validFrom: ref.validFrom,
    validUntil: ref.validUntil,
    sourceUrl: ref.detailUrl,
    pageImageUrls: Array.from(pageImageUrls, (url) => url ?? ""),
    items,
  };
}

async function fetchAuchanCatalogues(): Promise<RemoteCatalogue[]> {
  const listHtml = await politeFetchText(LIST_URL, { source: SOURCE });
  const result: RemoteCatalogue[] = [];
  for (const ref of auchanCatalogueRefsFromHtml(listHtml).slice(0, MAX_CATALOGUES)) {
    const detailHtml = await politeFetchText(ref.detailUrl, { source: SOURCE });
    result.push(auchanCatalogueFromHtml(ref, detailHtml));
  }
  return result;
}

registerFlipbook("auchan", { source: fetchAuchanCatalogues, storeKeyed: false });
