import { describe, expect, it } from "vitest";
import { nextScale } from "../src/components/lightbox";

/**
 * The leaflet lightbox zoom stepper: 0.25 per wheel notch, clamped to [1, 4]
 * so the page never disappears (over-zoom) or inverts (under-zoom).
 */
describe("lightbox zoom stepper", () => {
  it("steps 0.25 per notch: wheel-up zooms in, wheel-down zooms out", () => {
    expect(nextScale(2, -100)).toBe(2.25);
    expect(nextScale(2, 100)).toBe(1.75);
  });

  it("clamps at the 1× floor", () => {
    expect(nextScale(1, 100)).toBe(1);
    expect(nextScale(1.25, 100)).toBe(1);
  });

  it("clamps at the 4× ceiling", () => {
    expect(nextScale(4, -100)).toBe(4);
    expect(nextScale(3.75, -100)).toBe(4);
  });
});
