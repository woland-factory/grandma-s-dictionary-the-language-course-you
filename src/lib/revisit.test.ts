import { describe, expect, it } from "vitest";
import { INTERVAL_DAYS, nextRevisit } from "./revisit";

const DAY = 24 * 60 * 60 * 1000;
const T = 1_700_000_000_000; // a fixed epoch so the assertions are exact

describe("nextRevisit", () => {
  it("advances a new entry (index 0) by one day", () => {
    expect(nextRevisit(0, T)).toEqual({ intervalIndex: 1, dueAt: T + 1 * DAY });
  });

  it("expands through 3, 7, 14, 30 days", () => {
    expect(nextRevisit(1, T)).toEqual({ intervalIndex: 2, dueAt: T + 3 * DAY });
    expect(nextRevisit(2, T)).toEqual({ intervalIndex: 3, dueAt: T + 7 * DAY });
    expect(nextRevisit(3, T)).toEqual({ intervalIndex: 4, dueAt: T + 14 * DAY });
    expect(nextRevisit(4, T)).toEqual({ intervalIndex: 5, dueAt: T + 30 * DAY });
  });

  it("caps the step at 30 days for index 5 and beyond", () => {
    expect(nextRevisit(5, T)).toEqual({ intervalIndex: 6, dueAt: T + 30 * DAY });
    expect(nextRevisit(9, T)).toEqual({
      intervalIndex: 10,
      dueAt: T + 30 * DAY,
    });
  });

  it("never reads the clock itself (returns the caller's now plus the step)", () => {
    const step = INTERVAL_DAYS[0] * DAY;
    expect(nextRevisit(0, 0).dueAt).toBe(step);
    expect(nextRevisit(0, 12345).dueAt).toBe(12345 + step);
  });
});
