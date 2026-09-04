/** Retailer seed — slugs are stable identifiers used by adapters and prefs. */
export const RETAILERS: {
  slug: string;
  name: string;
  nameFr?: string;
  kind: "chain" | "independent";
  adapter?: string;
}[] = [
  { slug: "carrefour", name: "Carrefour", kind: "chain", adapter: "carrefour" },
  { slug: "intermarche", name: "Intermarché", kind: "chain", adapter: "intermarche" },
  { slug: "lidl", name: "Lidl", kind: "chain" },
  { slug: "leclerc", name: "E.Leclerc", kind: "chain" },
  { slug: "monoprix", name: "Monoprix", kind: "chain" },
  { slug: "franprix", name: "Franprix", kind: "chain" },
  { slug: "g20", name: "G20", kind: "chain" },
  { slug: "independent", name: "Independent", nameFr: "Indépendant", kind: "independent" },
];
