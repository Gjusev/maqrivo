/**
 * Client-safe retailer list for the catalogue and promotion forms (plan 006).
 * `source` is the honesty label: "auto" retailers have a flipbook adapter
 * registered (server/integrations/retailers/adapters.ts) so catalogues sync
 * automatically; "photo" ones have no adapter and only work through page
 * photos — the forms say so instead of silently yielding zero catalogues.
 * Labels duplicate packages/db/src/seed/retailers.ts on purpose: importing
 * the db package here would drag server code into client bundles.
 */
export interface CatalogueRetailer {
  slug: string;
  label: string;
  source: "auto" | "photo";
}

export const CATALOGUE_RETAILERS: CatalogueRetailer[] = [
  { slug: "aldi", label: "Aldi", source: "auto" },
  { slug: "carrefour", label: "Carrefour", source: "photo" },
  { slug: "auchan", label: "Auchan", source: "auto" },
  { slug: "intermarche", label: "Intermarché", source: "auto" },
  { slug: "lidl", label: "Lidl", source: "auto" },
  { slug: "leclerc", label: "E.Leclerc", source: "photo" },
  { slug: "monoprix", label: "Monoprix", source: "auto" },
  { slug: "franprix", label: "Franprix", source: "photo" },
  { slug: "g20", label: "G20", source: "auto" },
  { slug: "independent", label: "Independent", source: "photo" },
];
