/** Retailer seed — slugs are stable identifiers used by adapters and prefs. */
export const RETAILERS: {
  slug: string;
  name: string;
  nameFr?: string;
  kind: "chain" | "independent";
  adapter?: string;
}[] = [
  { slug: "aldi", name: "Aldi", kind: "chain", adapter: "aldi" },
  { slug: "carrefour", name: "Carrefour", kind: "chain", adapter: "carrefour" },
  { slug: "auchan", name: "Auchan", kind: "chain", adapter: "auchan" },
  { slug: "intermarche", name: "Intermarché", kind: "chain", adapter: "intermarche" },
  { slug: "lidl", name: "Lidl", kind: "chain", adapter: "lidl" },
  { slug: "leclerc", name: "E.Leclerc", kind: "chain" },
  { slug: "monoprix", name: "Monoprix", kind: "chain", adapter: "monoprix" },
  { slug: "franprix", name: "Franprix", kind: "chain" },
  { slug: "g20", name: "G20", kind: "chain", adapter: "g20" },
  { slug: "independent", name: "Independent", nameFr: "Indépendant", kind: "independent" },
];
