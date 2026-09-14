import { describe, expect, it } from "vitest";
import { CATEGORIES, DECK, categoryLabel, type CategoryId } from "./deck";

// The same banned-pattern list the copy sweep uses. Every prompt text and
// every category label is user-visible, so it must pass the same bar.
const BANNED = [
  /—/,
  /–/,
  /\bseamless(ly)?\b/i,
  /\beffortless(ly)?\b/i,
  /\bunlock\b/i,
  /\belevate\b/i,
  /\bempower\b/i,
  /\bleverage\b/i,
  /\brobust\b/i,
  /\bdive in\b/i,
  /in today's fast-paced world/i,
  /we've got you covered/i,
  /you don't have/i,
  /\bno .{0,20} yet\b/i,
  /nothing .{0,20} here/i,
  /\bunable to\b/i,
  /something went wrong/i,
];

describe("interview deck", () => {
  it("ships at least 30 prompts", () => {
    expect(DECK.length).toBeGreaterThanOrEqual(30);
  });

  it("uses exactly the six named categories", () => {
    const ids = CATEGORIES.map((c) => c.id).sort();
    expect(ids).toEqual(
      [
        "blessings",
        "endearments",
        "family-words",
        "foods",
        "for-children",
        "kinship",
      ].sort(),
    );
  });

  it("has every category represented in the deck", () => {
    for (const category of CATEGORIES) {
      const count = DECK.filter((p) => p.category === category.id).length;
      expect(count, `category ${category.id} has prompts`).toBeGreaterThan(0);
    }
  });

  it("has a unique, non-empty id for every prompt", () => {
    const ids = DECK.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.trim().length).toBeGreaterThan(0);
    }
  });

  it("references only valid categories", () => {
    const valid = new Set<CategoryId>(CATEGORIES.map((c) => c.id));
    for (const prompt of DECK) {
      expect(valid.has(prompt.category), `${prompt.id} category`).toBe(true);
    }
  });

  it("has non-empty text and defaultMeaning on every prompt", () => {
    for (const prompt of DECK) {
      expect(prompt.text.trim().length, `${prompt.id} text`).toBeGreaterThan(0);
      expect(
        prompt.defaultMeaning.trim().length,
        `${prompt.id} defaultMeaning`,
      ).toBeGreaterThan(0);
    }
  });

  it("passes the copy sweep on every prompt text and category label", () => {
    const strings = [
      ...CATEGORIES.map((c) => c.label),
      ...DECK.map((p) => p.text),
      ...DECK.map((p) => p.defaultMeaning),
    ];
    for (const value of strings) {
      for (const pattern of BANNED) {
        const match = value.match(pattern);
        expect(
          match,
          `banned pattern ${pattern} found in "${value}": "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it("resolves category labels and falls back to the raw id", () => {
    expect(categoryLabel("kinship")).toBe("Family names");
    expect(categoryLabel("uncategorized")).toBe("uncategorized");
  });
});
