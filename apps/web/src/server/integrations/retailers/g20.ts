/**
 * G20 adapter — the official g20-minute.com promotions page is permissive,
 * server-rendered Spree HTML. Product card ids are EANs and basket prices
 * are integer cents, so no OCR or AI is involved.
 */
import { createHash } from "node:crypto";
import { politeFetchText } from "../http";
import { registerFlipbook, type RemoteCatalogue, type RemoteCatalogueItem } from "./flipbook";
import { cleanHtmlText, decimalEurosToCents } from "./html";

const SOURCE = "g20";
const PROMOTIONS_URL = "https://www.g20-minute.com/taxons/promotions";

function classContent(block: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<([a-z0-9]+)\\b[^>]*class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i",
  );
  return pattern.exec(block)?.[2] ?? "";
}

function classText(block: string, className: string): string {
  return cleanHtmlText(classContent(block, className));
}

function firstEuroAmount(value: string): number | null {
  return decimalEurosToCents(/([\d.,]+)\s*€/i.exec(cleanHtmlText(value))?.[1]);
}

export function g20ItemsFromHtml(html: string): RemoteCatalogueItem[] {
  const starts = Array.from(html.matchAll(/<div\s+id=["']product-(\d{6,14})["'][^>]*>/gi));
  const items: RemoteCatalogueItem[] = [];

  for (const [index, start] of starts.entries()) {
    const ean = start[1] ?? null;
    const from = start.index ?? 0;
    const to = starts[index + 1]?.index ?? html.length;
    const block = html.slice(from, to);
    const label = classText(block, "item-name");
    const basketPriceCents = Number.parseInt(/data-qty-price=["'](\d+)["']/i.exec(block)?.[1] ?? "0", 10);
    const priceParagraphs = Array.from(
      classContent(block, "promo-price-amount").matchAll(/<p\b(?<attrs>[^>]*)>(?<text>[\s\S]*?)<\/p>/gi),
    );
    const displayedPriceCents = firstEuroAmount(priceParagraphs[0]?.groups?.text ?? "");
    const displayedOldCents = firstEuroAmount(
      priceParagraphs.find((paragraph) => /price-old/i.test(paragraph.groups?.attrs ?? ""))?.groups?.text ?? "",
    );
    let priceCents = displayedPriceCents ?? (basketPriceCents > 0 ? basketPriceCents : null);
    if (!ean || !label || priceCents == null) continue;

    const attributes = Array.from(
      block.matchAll(/<li\b[^>]*class=["'][^"']*\bproduct-attr\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi),
      (match) => cleanHtmlText(match[1]),
    ).filter(Boolean);
    const unitPrice = attributes.find((value) => /€\s*\/\s*kg/i.test(value));
    const unitMatch = unitPrice?.match(/([\d.,]+)\s*€\s*\/\s*kg/i);
    const promoTitle = classText(block, "promo-title");
    const promoDescription = classText(block, "promo-description");
    const validityText = [promoTitle, promoDescription].filter(Boolean).join(" · ") || null;
    let regularPriceCents = displayedOldCents;
    let mechanism: RemoteCatalogueItem["mechanism"] = displayedOldCents ? "PROMO_PRICE" : undefined;
    let minQty: number | null = null;
    let discountPct: number | null = null;

    const secondUnit = /1\s+ACHET[ÉE]\s+(\d+)\s*%\s+SUR\s+LE\s+2/i.exec(promoTitle);
    if (secondUnit) {
      discountPct = Number.parseInt(secondUnit[1] ?? "0", 10);
      regularPriceCents = priceCents;
      priceCents = Math.round((priceCents * (2 - discountPct / 100)) / 2);
      mechanism = "SECOND_UNIT_DISCOUNT";
      minQty = 2;
    } else {
      const bonusCents = firstEuroAmount(promoDescription);
      if (/BONUS\s+\d+\s*%/i.test(promoTitle) && bonusCents != null && bonusCents < priceCents) {
        discountPct = Number.parseInt(/BONUS\s+(\d+)/i.exec(promoTitle)?.[1] ?? "0", 10) || null;
        regularPriceCents = priceCents;
        priceCents -= bonusCents;
        mechanism = "LOYALTY_CREDIT";
      } else {
        const directPercent = /PROMO\s*-\s*(\d+)\s*%/i.exec(promoTitle);
        if (directPercent) {
          discountPct = Number.parseInt(directPercent[1] ?? "0", 10) || null;
          mechanism = "PERCENTAGE_OFF";
        }
      }
    }

    items.push({
      ean,
      label,
      brand: null,
      priceCents,
      regularPriceCents,
      pricePerKgCents: decimalEurosToCents(unitMatch?.[1]),
      packaging: attributes.find((value) => !/€\s*\//.test(value)) ?? null,
      category: null,
      loyalty: /item-fidelity|promo--fidelity/i.test(block),
      validityText,
      mechanism,
      minQty,
      discountPct,
      conditionsRaw: validityText,
      page: null,
    });
  }
  return items;
}

export function g20CatalogueFromHtml(html: string): RemoteCatalogue {
  const items = g20ItemsFromHtml(html);
  const fingerprint = createHash("sha256")
    .update(items.map((item) => `${item.ean}:${String(item.priceCents)}`).join("|"))
    .digest("hex")
    .slice(0, 16);
  return {
    externalId: `promotions-${fingerprint}`,
    title: "Promotions G20",
    validFrom: null,
    validUntil: null,
    sourceUrl: PROMOTIONS_URL,
    pageImageUrls: [],
    items,
  };
}

async function fetchG20Promotions(): Promise<RemoteCatalogue[]> {
  const html = await politeFetchText(PROMOTIONS_URL, { source: SOURCE });
  return [g20CatalogueFromHtml(html)];
}

registerFlipbook("g20", { source: fetchG20Promotions, storeKeyed: false });
