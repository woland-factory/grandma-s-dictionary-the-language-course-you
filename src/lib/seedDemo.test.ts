import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// seedDemoEnabled is computed at import time from window.__APP_CONFIG__, so we
// reset modules and set config before each dynamic import.
async function load(seedDemo: string) {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  window.__APP_CONFIG__ = {
    SEED_DEMO: seedDemo,
    UMAMI_URL: "",
    UMAMI_WEBSITE_ID: "",
    SENTRY_DSN: "",
  };
  const seed = await import("./seedDemo");
  const db = await import("./db");
  return { seed, db };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL) =>
    Promise.resolve(handler(String(input))),
  );
}

describe("maybeSeedDemo", () => {
  it("does nothing when SEED_DEMO is unset", async () => {
    const { seed, db } = await load("");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await seed.maybeSeedDemo();
    expect(spy).not.toHaveBeenCalled();
    expect(await db.countEntries()).toBe(0);
    expect(await db.getMeta("demoSeeded")).toBeUndefined();
  });

  it("handles an empty manifest cleanly and marks demoSeeded", async () => {
    const { seed, db } = await load("1");
    mockFetch(() => new Response(JSON.stringify({ schemaVersion: 1, entries: [] })));
    await seed.maybeSeedDemo();
    expect(await db.countEntries()).toBe(0);
    expect(await db.getMeta("demoSeeded")).toBe(true);
  });

  it("does not re-seed once demoSeeded is set", async () => {
    const { seed, db } = await load("1");
    const fetchSpy = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ schemaVersion: 1, entries: [] }))),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await seed.maybeSeedDemo();
    await seed.maybeSeedDemo();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await db.getMeta("demoSeeded")).toBe(true);
  });

  it("does not crash on a missing manifest and still marks demoSeeded", async () => {
    const { seed, db } = await load("1");
    mockFetch(() => new Response("not found", { status: 404 }));
    await expect(seed.maybeSeedDemo()).resolves.toBeUndefined();
    expect(await db.countEntries()).toBe(0);
    expect(await db.getMeta("demoSeeded")).toBe(true);
  });

  it("imports entries listed in the manifest", async () => {
    const { seed, db } = await load("1");
    mockFetch((url) => {
      if (url.includes("manifest.json")) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            entries: [
              {
                writtenForm: "yiayia",
                meaning: "grandmother",
                category: "kinship",
                audio: "demo/audio/yiayia.webm",
                durationMs: 900,
              },
            ],
          }),
        );
      }
      return new Response(new Blob([new Uint8Array(16)], { type: "audio/webm" }));
    });
    await seed.maybeSeedDemo();
    expect(await db.countEntries()).toBe(1);
    const [entry] = await db.listEntries();
    expect(entry.meaning).toBe("grandmother");
    expect(entry.category).toBe("kinship");
  });

  it("seeds a child attempt for an entry that carries one", async () => {
    const { seed, db } = await load("1");
    mockFetch((url) => {
      if (url.includes("manifest.json")) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            entries: [
              {
                writtenForm: "yiayia",
                meaning: "grandmother",
                category: "kinship",
                audio: "demo/audio/yiayia-elder.wav",
                durationMs: 1160,
                attempt: {
                  audio: "demo/audio/yiayia-child.wav",
                  durationMs: 920,
                },
              },
              {
                writtenForm: "psomi",
                meaning: "bread",
                category: "foods",
                audio: "demo/audio/psomi-elder.wav",
                durationMs: 580,
              },
            ],
          }),
        );
      }
      return new Response(
        new Blob([new Uint8Array(16)], { type: "audio/wav" }),
      );
    });
    await seed.maybeSeedDemo();

    expect(await db.countEntries()).toBe(2);
    const rows = await db.listEntries();
    const withAttempt = rows.find((e) => e.meaning === "grandmother")!;
    const elderOnly = rows.find((e) => e.meaning === "bread")!;
    expect((await db.listAttempts(withAttempt.id)).length).toBe(1);
    expect((await db.listAttempts(elderOnly.id)).length).toBe(0);
  });

  it("saves the entry even when its attempt asset is missing", async () => {
    const { seed, db } = await load("1");
    mockFetch((url) => {
      if (url.includes("manifest.json")) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            entries: [
              {
                writtenForm: "yiayia",
                meaning: "grandmother",
                category: "kinship",
                audio: "demo/audio/yiayia-elder.wav",
                durationMs: 1160,
                attempt: { audio: "demo/audio/missing.wav", durationMs: 900 },
              },
            ],
          }),
        );
      }
      if (url.includes("missing.wav")) {
        return new Response("not found", { status: 404 });
      }
      return new Response(
        new Blob([new Uint8Array(16)], { type: "audio/wav" }),
      );
    });
    await seed.maybeSeedDemo();

    expect(await db.countEntries()).toBe(1);
    const [entry] = await db.listEntries();
    expect(await db.listAttempts(entry.id)).toHaveLength(0);
  });
});
