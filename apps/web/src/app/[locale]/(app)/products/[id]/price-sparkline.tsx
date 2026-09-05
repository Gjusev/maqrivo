/**
 * Price history sparkline: pure inline SVG, no client JS. Time on X,
 * price on Y — both proportional (no index-based lying about duration).
 * Colors come from the Tailwind v4 CSS custom properties.
 */
export function PriceSparkline({
  points,
  className = "h-10 w-full",
}: {
  points: readonly { observedAt: number; amountCents: number }[];
  className?: string;
}) {
  if (points.length < 2) return null;

  const W = 120;
  const H = 36;
  const PAD = 3;
  const times = points.map((p) => p.observedAt);
  const amounts = points.map((p) => p.amountCents);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const timeSpan = maxTime - minTime;
  const flat = minAmount === maxAmount;

  const x = (t: number): number =>
    timeSpan === 0 ? W / 2 : PAD + ((t - minTime) / timeSpan) * (W - 2 * PAD);
  const y = (c: number): number =>
    flat ? H / 2 : H - PAD - ((c - minAmount) / (maxAmount - minAmount)) * (H - 2 * PAD);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.observedAt).toFixed(1)},${y(p.amountCents).toFixed(1)}`)
    .join(" ");
  const firstX = x(points[0]!.observedAt).toFixed(1);
  const lastX = x(points[points.length - 1]!.observedAt).toFixed(1);
  const area = `${line} L${lastX},${H} L${firstX},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" preserveAspectRatio="none">
      <path d={area} fill="var(--color-brand-100)" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Latest-point tick — markers must not stretch, strokes stay crisp. */}
      <path
        d={`M${lastX},${y(points[points.length - 1]!.amountCents).toFixed(1)} L${lastX},${H}`}
        stroke="var(--color-brand-300)"
        strokeWidth="1"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
