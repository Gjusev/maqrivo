import { describe, expect, it } from "vitest";
import {
  conversionFactor,
  convert,
  dimensionOf,
  isCompatible,
  quantity,
  toBase,
} from "../src/units/types";
import { formatQuantity } from "../src/units/format";

describe("unit dimensions and compatibility", () => {
  it("classifies units into dimensions", () => {
    expect(dimensionOf("g")).toBe("mass");
    expect(dimensionOf("kg")).toBe("mass");
    expect(dimensionOf("ml")).toBe("volume");
    expect(dimensionOf("l")).toBe("volume");
    expect(dimensionOf("unit")).toBe("count");
    expect(dimensionOf("pack")).toBe("count");
  });

  it("mass is compatible with mass only", () => {
    expect(isCompatible("kg", "g")).toBe(true);
    expect(isCompatible("l", "ml")).toBe(true);
    expect(isCompatible("g", "ml")).toBe(false);
    expect(isCompatible("unit", "pack")).toBe(true);
    expect(isCompatible("unit", "g")).toBe(false);
  });

  it("rejects conversion across dimensions", () => {
    expect(() => conversionFactor("g", "l")).toThrow(/Incompatible/);
  });
});

describe("unit conversion", () => {
  it("converts kg to g exactly", () => {
    expect(convert(1.5, "kg", "g")).toBe(1500);
    expect(convert(0.25, "kg", "g")).toBe(250);
  });

  it("converts g to kg", () => {
    expect(convert(1500, "g", "kg")).toBe(1.5);
  });

  it("converts l to ml", () => {
    expect(convert(2, "l", "ml")).toBe(2000);
  });

  it("count units are identity", () => {
    expect(convert(3, "unit", "unit")).toBe(3);
  });

  it("reduces quantities to base units", () => {
    expect(toBase(quantity(1.5, "kg"))).toEqual({ amount: 1500, unit: "g" });
    expect(toBase(quantity(750, "ml"))).toEqual({ amount: 750, unit: "ml" });
    expect(toBase(quantity(2, "pack"))).toEqual({ amount: 2, unit: "unit" });
  });
});

describe("locale-aware quantity formatting", () => {
  it("formats 1.5 kg in French with comma decimal", () => {
    expect(formatQuantity(quantity(1500, "g"), "fr")).toBe("1,5 kg");
  });

  it("formats 1.5 kg in English with point decimal", () => {
    expect(formatQuantity(quantity(1500, "g"), "en")).toBe("1.5 kg");
  });

  it("keeps grams under a kilo", () => {
    expect(formatQuantity(quantity(600, "g"), "fr")).toBe("600 g");
    expect(formatQuantity(quantity(600, "g"), "en")).toBe("600 g");
  });

  it("formats litres culturally", () => {
    expect(formatQuantity(quantity(1500, "ml"), "fr")).toBe("1,5 l");
    expect(formatQuantity(quantity(1.5, "l"), "en")).toBe("1.5 l");
  });

  it("formats fractional litres from ml below one litre", () => {
    expect(formatQuantity(quantity(250, "ml"), "fr")).toBe("250 ml");
  });

  it("formats counts without decimals", () => {
    expect(formatQuantity(quantity(3, "unit"), "fr")).toBe("3 unit");
    expect(formatQuantity(quantity(2, "pack"), "en")).toBe("2 pack");
  });
});
