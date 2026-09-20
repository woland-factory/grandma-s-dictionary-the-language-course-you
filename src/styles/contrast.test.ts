import { describe, expect, it } from "vitest";

// Dependency-free WCAG contrast check over the palette tokens the UI actually
// uses. The ratio math is the standard WCAG 2.x relative-luminance formula, so
// no accessibility library is needed. If a pair ever fails, darken the offending
// token in src/styles/index.css by one step until it passes; do not restyle
// components.

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Token values mirror src/styles/index.css. AA large = 3:1 (h1/h2 and the
// two-voice button); everything else is normal text at 4.5:1.
const AA_NORMAL = 4.5;
const AA_LARGE = 3;

const PAIRS: Array<{ name: string; fg: string; bg: string; min: number }> = [
  { name: "--ink on --bg", fg: "#2c2118", bg: "#fbf6ee", min: AA_NORMAL },
  { name: "--ink on --surface", fg: "#2c2118", bg: "#ffffff", min: AA_NORMAL },
  { name: "--ink-soft on --bg", fg: "#5c4d3f", bg: "#fbf6ee", min: AA_NORMAL },
  {
    name: "--ink-soft on --surface",
    fg: "#5c4d3f",
    bg: "#ffffff",
    min: AA_NORMAL,
  },
  {
    name: "--brand-ink on --brand (primary button)",
    fg: "#ffffff",
    bg: "#8a4b2a",
    min: AA_NORMAL,
  },
  {
    name: "--brand-strong on --bg (links)",
    fg: "#6f3a1e",
    bg: "#fbf6ee",
    min: AA_NORMAL,
  },
  {
    name: "--accent on badge background",
    fg: "#2f6b52",
    bg: "#edf3ef",
    min: AA_NORMAL,
  },
  {
    name: "--danger on error notice background",
    fg: "#9a2f2f",
    bg: "#fbeceb",
    min: AA_NORMAL,
  },
];

describe("palette contrast (WCAG AA)", () => {
  it("sanity: white on black is the maximum ratio", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });

  for (const pair of PAIRS) {
    it(`${pair.name} meets AA (>= ${pair.min}:1)`, () => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(
        ratio,
        `${pair.name} ratio ${ratio.toFixed(2)} is below ${pair.min}`,
      ).toBeGreaterThanOrEqual(pair.min);
    });
  }

  it("large-text tokens clear the 3:1 large-text floor too", () => {
    // The two-voice button and headings use the brand tokens at large sizes.
    expect(contrastRatio("#ffffff", "#8a4b2a")).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio("#2c2118", "#ffffff")).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
