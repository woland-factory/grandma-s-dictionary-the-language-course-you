import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import {
  DB_NAME,
  DB_VERSION,
  _resetDBForTests,
  countDueEntries,
  countEntries,
  getAttemptAudio,
  getDB,
  getEntry,
  getEntryAudio,
  getRecording,
  getRevisit,
  listAttempts,
  listDueEntries,
  listEntries,
  saveAttempt,
  saveEntryWithRecording,
} from "./db";

const DAY = 24 * 60 * 60 * 1000;

function makeBlob(bytes = 64): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "audio/webm" });
}

beforeEach(() => {
  // Fresh database per test.
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();
});

describe("db schema", () => {
  it("opens at the current version and creates every store and index", async () => {
    const db = await getDB();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual([
      "attempts",
      "audioBlobs",
      "dictionaries",
      "elderRecordings",
      "entries",
      "meta",
      "revisit",
    ]);
    expect([...db.transaction("entries").store.indexNames]).toContain(
      "by-createdAt",
    );
    expect([...db.transaction("attempts").store.indexNames]).toContain(
      "by-entry",
    );
    expect([...db.transaction("revisit").store.indexNames]).toContain(
      "by-dueAt",
    );
  });
});

// Builds a v1 database (the pre-EPIC-3 schema) with one entry, its recording,
// and its blob, then closes it so getDB() can reopen and run the v1->v2
// migration.
async function seedV1WithEntry(): Promise<{
  entryId: string;
  createdAt: number;
}> {
  const entryId = "entry-1";
  const createdAt = 1_700_000_000_000;
  const db = await openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore("meta", { keyPath: "key" });
      d.createObjectStore("dictionaries", { keyPath: "id" });
      const entries = d.createObjectStore("entries", { keyPath: "id" });
      entries.createIndex("by-createdAt", "createdAt");
      d.createObjectStore("elderRecordings", { keyPath: "id" });
      d.createObjectStore("audioBlobs", { keyPath: "id" });
    },
  });
  await db.put("dictionaries", {
    id: "dict-1",
    createdAt,
    schemaVersion: 1,
  });
  await db.put("audioBlobs", {
    id: "blob-1",
    blob: makeBlob(),
    mimeType: "audio/webm",
    sizeBytes: 64,
  });
  await db.put("elderRecordings", {
    id: "rec-1",
    audioBlobId: "blob-1",
    durationMs: 1000,
    recordedAt: createdAt,
  });
  await db.put("entries", {
    id: entryId,
    dictionaryId: "dict-1",
    meaning: "grandmother",
    category: "kinship",
    elderRecordingId: "rec-1",
    createdAt,
  });
  db.close();
  return { entryId, createdAt };
}

describe("v1 -> v2 migration", () => {
  it("adds a revisit row per existing entry (due at its createdAt) and leaves entries untouched", async () => {
    const { entryId, createdAt } = await seedV1WithEntry();
    _resetDBForTests();

    const db = await getDB();
    expect(db.version).toBe(2);

    const revisit = await getRevisit(entryId);
    expect(revisit).toEqual({ entryId, intervalIndex: 0, dueAt: createdAt });

    // The entry, its recording, and its blob are unchanged.
    const entry = await getEntry(entryId);
    expect(entry?.meaning).toBe("grandmother");
    expect(entry?.createdAt).toBe(createdAt);
    const recording = await getRecording("rec-1");
    expect(recording?.audioBlobId).toBe("blob-1");
    const audio = await getEntryAudio(entry!);
    expect(audio?.sizeBytes).toBe(64);
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

describe("saveEntryWithRecording revisit row", () => {
  it("writes a revisit row due now alongside the entry", async () => {
    const before = Date.now();
    const { entry } = await saveEntryWithRecording({
      meaning: "grandmother",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 900 },
    });
    const after = Date.now();

    const revisit = await getRevisit(entry.id);
    expect(revisit?.intervalIndex).toBe(0);
    expect(revisit?.dueAt).toBeGreaterThanOrEqual(before);
    expect(revisit?.dueAt).toBeLessThanOrEqual(after);

    // A brand-new entry is immediately due.
    const due = await listDueEntries();
    expect(due.map((e) => e.id)).toContain(entry.id);
  });
});

describe("saveAttempt", () => {
  it("appends an attempt, advances the schedule, and preserves the elder and prior attempts", async () => {
    const { entry, recording } = await saveEntryWithRecording({
      meaning: "grandmother",
      audio: { blob: makeBlob(80), mimeType: "audio/webm", durationMs: 1000 },
    });

    const a1 = await saveAttempt(entry.id, {
      blob: makeBlob(40),
      mimeType: "audio/webm",
      durationMs: 500,
    });
    await new Promise((r) => setTimeout(r, 5));
    const a2 = await saveAttempt(entry.id, {
      blob: makeBlob(50),
      mimeType: "audio/webm",
      durationMs: 600,
    });

    // Two attempts, both for this entry, each with a date.
    const attempts = await listAttempts(entry.id);
    expect(attempts.map((a) => a.id)).toEqual([a2.id, a1.id]); // newest first
    expect(a1.recordedAt).toBeTypeOf("number");

    // The elder recording and its blob are untouched.
    const stillElder = await getRecording(recording.id);
    expect(stillElder?.audioBlobId).toBe(recording.audioBlobId);
    const elderAudio = await getEntryAudio((await getEntry(entry.id))!);
    expect(elderAudio?.sizeBytes).toBe(80);

    // Each attempt resolves its own distinct blob.
    const a1Audio = await getAttemptAudio(a1);
    const a2Audio = await getAttemptAudio(a2);
    expect(a1Audio?.sizeBytes).toBe(40);
    expect(a2Audio?.sizeBytes).toBe(50);

    // The schedule advanced twice: index 2, due about 3 days out (>1 day).
    const revisit = await getRevisit(entry.id);
    expect(revisit?.intervalIndex).toBe(2);
    expect(revisit!.dueAt).toBeGreaterThan(Date.now() + DAY);

    // Having advanced into the future, the entry is no longer due.
    const due = await listDueEntries();
    expect(due.map((e) => e.id)).not.toContain(entry.id);
  });

  it("counts attempts across all entries", async () => {
    const { countAttempts } = await import("./db");
    expect(await countAttempts()).toBe(0);
    const { entry } = await saveEntryWithRecording({
      meaning: "bread",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
    });
    await saveAttempt(entry.id, {
      blob: makeBlob(),
      mimeType: "audio/webm",
      durationMs: 100,
    });
    await saveAttempt(entry.id, {
      blob: makeBlob(),
      mimeType: "audio/webm",
      durationMs: 100,
    });
    expect(await countAttempts()).toBe(2);
  });

  it("caps listAttempts at the requested limit", async () => {
    const { entry } = await saveEntryWithRecording({
      meaning: "bread",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
    });
    for (let i = 0; i < 4; i++) {
      await saveAttempt(entry.id, {
        blob: makeBlob(),
        mimeType: "audio/webm",
        durationMs: 100,
      });
    }
    expect((await listAttempts(entry.id, 2)).length).toBe(2);
    expect((await listAttempts(entry.id)).length).toBe(4);
  });
});

describe("listDueEntries", () => {
  it("returns only currently-due entries, most overdue first, via the index", async () => {
    // Three entries; force distinct createdAt so ordering is stable.
    const past = await saveEntryWithRecording({
      meaning: "overdue",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
    });
    const now = await saveEntryWithRecording({
      meaning: "due now",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
    });
    const later = await saveEntryWithRecording({
      meaning: "future",
      audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
    });

    // Rewrite revisit rows to controlled dueAt values (schedule state only,
    // never the entries themselves).
    const db = await getDB();
    const t = Date.now();
    await db.put("revisit", {
      entryId: past.entry.id,
      intervalIndex: 0,
      dueAt: t - 2 * DAY,
    });
    await db.put("revisit", {
      entryId: now.entry.id,
      intervalIndex: 0,
      dueAt: t - 1 * DAY,
    });
    await db.put("revisit", {
      entryId: later.entry.id,
      intervalIndex: 1,
      dueAt: t + 5 * DAY,
    });

    const due = await listDueEntries(t);
    expect(due.map((e) => e.id)).toEqual([past.entry.id, now.entry.id]);
    expect(await countDueEntries(t)).toBe(2);
  });

  it("caps the due queue at the requested limit", async () => {
    const t = Date.now();
    for (let i = 0; i < 3; i++) {
      const { entry } = await saveEntryWithRecording({
        meaning: `w${i}`,
        audio: { blob: makeBlob(), mimeType: "audio/webm", durationMs: 100 },
      });
      const db = await getDB();
      await db.put("revisit", {
        entryId: entry.id,
        intervalIndex: 0,
        dueAt: t - (i + 1) * 1000,
      });
    }
    expect((await listDueEntries(t, 2)).length).toBe(2);
  });
});
