import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  DB_VERSION,
  _resetDBForTests,
  countEntries,
  getDB,
  getEntry,
  getEntryAudio,
  listEntries,
  saveEntryWithRecording,
} from "./db";

function makeBlob(bytes = 64): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "audio/webm" });
}

beforeEach(() => {
  // Fresh database per test.
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();
});

describe("db schema", () => {
  it("opens at version 1 and creates the v1 stores and index", async () => {
    const db = await getDB();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual([
      "audioBlobs",
      "dictionaries",
      "elderRecordings",
      "entries",
      "meta",
    ]);
    const tx = db.transaction("entries");
    expect([...tx.store.indexNames]).toContain("by-createdAt");
  });
});

describe("saveEntryWithRecording", () => {
  it("round-trips an entry with audio through IndexedDB", async () => {
    const { entry } = await saveEntryWithRecording({
      writtenForm: "yiayia",
      meaning: "grandmother",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 1200 },
    });

    const stored = await getEntry(entry.id);
    expect(stored?.meaning).toBe("grandmother");
    expect(stored?.writtenForm).toBe("yiayia");
    expect(stored?.category).toBe("uncategorized");

    const audio = await getEntryAudio(stored!);
    expect(audio?.mimeType).toBe("audio/webm");
    expect(audio?.sizeBytes).toBe(64);
    expect(audio?.blob).toBeInstanceOf(Blob);
  });

  it("writes blob, recording, and entry together (no orphan on success)", async () => {
    const { entry, recording } = await saveEntryWithRecording({
      meaning: "a blessing",
      audio: { blob: makeBlob(32), mimeType: "audio/webm", durationMs: 800 },
    });
    const db = await getDB();
    expect(await db.count("entries")).toBe(1);
    expect(await db.count("elderRecordings")).toBe(1);
    expect(await db.count("audioBlobs")).toBe(1);
    expect(entry.elderRecordingId).toBe(recording.id);
  });

  it("reuses one dictionary across entries", async () => {
    await saveEntryWithRecording({
      meaning: "one",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
    });
    await saveEntryWithRecording({
      meaning: "two",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
    });
    const db = await getDB();
    expect(await db.count("dictionaries")).toBe(1);
  });
});

describe("listEntries", () => {
  it("returns entries newest first via the index", async () => {
    const a = await saveEntryWithRecording({
      meaning: "first",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
    });
    // Force a strictly later createdAt.
    await new Promise((r) => setTimeout(r, 5));
    const b = await saveEntryWithRecording({
      meaning: "second",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
    });

    const list = await listEntries();
    expect(list.map((e) => e.id)).toEqual([b.entry.id, a.entry.id]);
    expect(await countEntries()).toBe(2);
  });
});
