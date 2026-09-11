import { describe, expect, it } from "vitest";
import { isTruthy } from "./config";
import { scrubEvent } from "./telemetry";

describe("isTruthy", () => {
  it("treats empty, 0, and false as off", () => {
    expect(isTruthy("")).toBe(false);
    expect(isTruthy("0")).toBe(false);
    expect(isTruthy("false")).toBe(false);
    expect(isTruthy("FALSE")).toBe(false);
  });

  it("treats any other non-empty value as on", () => {
    expect(isTruthy("1")).toBe(true);
    expect(isTruthy("true")).toBe(true);
    expect(isTruthy("yes")).toBe(true);
  });
});

describe("scrubEvent", () => {
  it("removes request, user, and extra data that could carry PII", () => {
    const event = {
      message: "boom",
      request: { url: "https://app/entry/secret-id", headers: { cookie: "x" } },
      user: { id: "family-1", email: "a@b.co" },
      transaction: "/entry/secret-id",
      extra: { meaning: "grandmother" },
    };
    const scrubbed = scrubEvent({ ...event });
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.transaction).toBe("[redacted]");
    expect(scrubbed.extra).toEqual({});
    // The bare message is kept; it never contains family data by construction.
    expect(scrubbed.message).toBe("boom");
  });
});
