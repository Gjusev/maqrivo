/** Locale-aware distance: "2,5 km" fr / "2.5 km" en; metres under 1 km. */
export function formatDistance(meters: number, locale?: string): string {
  const resolved = locale ?? "fr";
  if (meters < 1000) {
    return new Intl.NumberFormat(resolved === "fr" ? "fr-FR" : "en-GB", {
      style: "unit",
      unit: "meter",
      maximumFractionDigits: 0,
    }).format(meters);
  }
  return new Intl.NumberFormat(resolved === "fr" ? "fr-FR" : "en-GB", {
    style: "unit",
    unit: "kilometer",
    maximumFractionDigits: 1,
  }).format(meters / 1000);
}
