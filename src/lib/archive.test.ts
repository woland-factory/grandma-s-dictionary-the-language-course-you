import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  ArchiveError,
  buildArchive,
  importArchive,
  parseArchive,
  type ArchiveErrorKind,
  type ArchiveManifest,
  type ParsedArchive,
} from "./archive";
import {
  _resetDBForTests,
  getDB,
  getRevisit,
  saveAttempt,
  saveEntryWithRecording,
  type Attempt,
} from "./db";

function makeBlob(bytes: number, seed = 1): Blob {
  const data = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) data[i] = (i * seed + seed) % 256;
  return new Blob([data], { type: "audio/webm" });
}

async function blobBytes(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

// A brand-new empty IndexedDB universe, emulating a different device.
function wipeDB(): void {
  globalThis.indexedDB = new IDBFactory();
  _resetDBForTests();
}

async function archiveBytes(): Promise<ArrayBuffer> {
  const { blob } = await buildArchive();
  return blob.arrayBuffer();
}

beforeEach(() => {
  wipeDB();
});

describe("buildArchive", () => {
  it("covers every row in all six stores, beyond any UI list cap", async () => {
    // Direct puts: 510 entries (past the 500-row UI list cap), each with its
    // own recording and audio blob, plus attempts and revisit rows.
    const db = await getDB();
    await db.put("dictionaries", {
      id: "dict-1",
      familyName: "Papadakis",
      createdAt: 1000,
      schemaVersion: 1,
    });
    for (let i = 0; i < 510; i++) {
      await db.put("audioBlobs", {
        id: `blob-${i}`,
        blob: makeBlob(8, i + 1),
        mimeType: "audio/webm",
        sizeBytes: 8,
      });
      await db.put("elderRecordings", {
        id: `rec-${i}`,
        audioBlobId: `blob-${i}`,
        durationMs: 100,
        recordedAt: 2000 + i,
      });
      await db.put("entries", {
        id: `entry-${i}`,
        dictionaryId: "dict-1",
        meaning: `word ${i}`,
        category: "food",
        elderRecordingId: `rec-${i}`,
        createdAt: 2000 + i,
      });
      await db.put("revisit", {
        entryId: `entry-${i}`,
        intervalIndex: 1,
        dueAt: 3000 + i,
      });
    }
    await db.put("audioBlobs", {
      id: "blob-a",
      blob: makeBlob(12, 99),
      mimeType: "audio/webm",
      sizeBytes: 12,
    });
    await db.put("attempts", {
      id: "attempt-1",
      entryId: "entry-0",
      audioBlobId: "blob-a",
      durationMs: 300,
      recordedAt: 4000,
    });

    const { blob, filename } = await buildArchive();
    expect(blob.type).toBe("application/zip");
    expect(filename).toMatch(/^grandmas-dictionary-\d{4}-\d{2}-\d{2}\.zip$/);

    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const manifest = JSON.parse(
      strFromU8(files["dictionary.json"]),
    ) as ArchiveManifest;
    expect(manifest.format).toBe("grandmas-dictionary");
    expect(manifest.archiveVersion).toBe(1);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.dictionary).toEqual({
      id: "dict-1",
      familyName: "Papadakis",
      createdAt: 1000,
      schemaVersion: 1,
    });
    expect(manifest.entries.length).toBe(510);
    expect(manifest.elderRecordings.length).toBe(510);
    expect(manifest.attempts.length).toBe(1);
    expect(manifest.revisits.length).toBe(510);
    expect(manifest.audio.length).toBe(511);

    // Every audio file byte-matches its stored blob.
    for (const row of manifest.audio) {
      const stored = await db.get("audioBlobs", row.id);
      expect(row.path).toBe(`audio/${row.id}.webm`);
      expect(Array.from(files[row.path])).toEqual(await blobBytes(stored!.blob));
      expect(row.sizeBytes).toBe(stored!.sizeBytes);
    }
  });

  it("omits absent optional fields and round-trips through JSON.parse", async () => {
    await saveEntryWithRecording({
      meaning: "grandmother",
      audio: { blob: makeBlob(16), mimeType: "audio/webm", durationMs: 200 },
    });

    const files = unzipSync(new Uint8Array(await archiveBytes()));
    const manifest = JSON.parse(
      strFromU8(files["dictionary.json"]),
    ) as ArchiveManifest;
    const entry = manifest.entries[0] as unknown as Record<string, unknown>;
    expect("writtenForm" in entry).toBe(false);
    expect("promptId" in entry).toBe(false);
    expect(
      "familyName" in (manifest.dictionary as unknown as Record<string, unknown>),
    ).toBe(false);
  });

  it("derives the cosmetic extension from the mime type", async () => {
    const db = await getDB();
    await db.put("dictionaries", { id: "d", createdAt: 1, schemaVersion: 1 });
    const cases: Array<[string, string, string]> = [
      ["b1", "audio/webm;codecs=opus", "webm"],
      ["b2", "audio/mp4", "m4a"],
      ["b3", "audio/aac", "aac"],
      ["b4", "audio/wav", "wav"],
      ["b5", "audio/ogg", "bin"],
    ];
    for (const [id, mimeType] of cases) {
      await db.put("audioBlobs", {
        id,
        blob: new Blob([new Uint8Array(4)], { type: mimeType }),
        mimeType,
        sizeBytes: 4,
      });
    }

    const files = unzipSync(new Uint8Array(await archiveBytes()));
    const manifest = JSON.parse(
      strFromU8(files["dictionary.json"]),
    ) as ArchiveManifest;
    for (const [id, , ext] of cases) {
      const row = manifest.audio.find((a) => a.id === id);
      expect(row?.path).toBe(`audio/${id}.${ext}`);
      expect(files[`audio/${id}.${ext}`]).toBeDefined();
    }
  });
});

// Seeds a small real dictionary: two entries (one with written form), one
// attempt on the first entry. Returns what round-trip assertions need.
async function seedDictionary() {
  const first = await saveEntryWithRecording({
    writtenForm: "yiayia",
    meaning: "grandmother",
    category: "kinship",
    promptId: "p1",
    audio: { blob: makeBlob(32, 3), mimeType: "audio/webm", durationMs: 900 },
  });
  const second = await saveEntryWithRecording({
    meaning: "a blessing",
    audio: { blob: makeBlob(24, 5), mimeType: "audio/webm", durationMs: 700 },
  });
  const attempt = await saveAttempt(first.entry.id, {
    blob: makeBlob(20, 7),
    mimeType: "audio/webm",
    durationMs: 400,
  });
  return { first, second, attempt };
}

async function storeCounts() {
  const db = await getDB();
  return {
    dictionaries: await db.count("dictionaries"),
    entries: await db.count("entries"),
    elderRecordings: await db.count("elderRecordings"),
    attempts: await db.count("attempts"),
    audioBlobs: await db.count("audioBlobs"),
    revisit: await db.count("revisit"),
  };
}

describe("round-trip import", () => {
  it("rebuilds every row and byte-identical audio on a fresh profile", async () => {
    const { first, second, attempt } = await seedDictionary();
    const db = await getDB();
    const originalDict = (await db.getAll("dictionaries"))[0];
    const originalRevisitFirst = await getRevisit(first.entry.id);
    const elderBytes = await blobBytes(
      (await db.get("audioBlobs", first.recording.audioBlobId))!.blob,
    );
    const attemptBytes = await blobBytes(
      (await db.get("audioBlobs", attempt.audioBlobId))!.blob,
    );
    const bytes = await archiveBytes();

    wipeDB();
    const summary = await importArchive(parseArchive(bytes));
    expect(summary).toEqual({
      addedEntries: 2,
      addedAttempts: 1,
      skippedExisting: 0,
    });

    const fresh = await getDB();
    expect(await storeCounts()).toEqual({
      dictionaries: 1,
      entries: 2,
      elderRecordings: 2,
      attempts: 1,
      audioBlobs: 3,
      revisit: 2,
    });
    // The dictionary row is restored as-is (fresh-profile restore).
    expect((await fresh.getAll("dictionaries"))[0]).toEqual(originalDict);
    expect(await fresh.get("entries", first.entry.id)).toEqual(first.entry);
    expect(await fresh.get("entries", second.entry.id)).toEqual(second.entry);
    expect(await fresh.get("attempts", attempt.id)).toEqual(attempt);
    // The archive's revisit schedule came along.
    expect(await getRevisit(first.entry.id)).toEqual(originalRevisitFirst);
    // Audio is byte-identical, with size recomputed from the real bytes.
    const elderRow = await fresh.get("audioBlobs", first.recording.audioBlobId);
    expect(await blobBytes(elderRow!.blob)).toEqual(elderBytes);
    expect(elderRow!.sizeBytes).toBe(elderBytes.length);
    expect(elderRow!.mimeType).toBe("audio/webm");
    const attemptRow = await fresh.get("audioBlobs", attempt.audioBlobId);
    expect(await blobBytes(attemptRow!.blob)).toEqual(attemptBytes);
  });

  it("adds zero rows and reports everything as already here on a second import", async () => {
    await seedDictionary();
    const bytes = await archiveBytes();

    wipeDB();
    await importArchive(parseArchive(bytes));
    const before = await storeCounts();

    const summary = await importArchive(parseArchive(bytes));
    expect(summary).toEqual({
      addedEntries: 0,
      addedAttempts: 0,
      skippedExisting: 3, // 2 entries + 1 attempt already present
    });
    expect(await storeCounts()).toEqual(before);
  });

  it("merges into a dictionary with its own entries: union, local revisit kept, archive attempt joins the shared entry", async () => {
    // Device A: one entry, exported early (no attempt yet).
    const shared = await saveEntryWithRecording({
      meaning: "shared word",
      audio: { blob: makeBlob(16, 11), mimeType: "audio/webm", durationMs: 300 },
    });
    const earlyBytes = await archiveBytes();

    // Device A later: an attempt on the shared entry plus a second entry.
    const attempt = await saveAttempt(shared.entry.id, {
      blob: makeBlob(18, 13),
      mimeType: "audio/webm",
      durationMs: 350,
    });
    const extra = await saveEntryWithRecording({
      meaning: "only in the archive",
      audio: { blob: makeBlob(16, 17), mimeType: "audio/webm", durationMs: 320 },
    });
    const lateBytes = await archiveBytes();

    // Device B: starts from the early export, then records its own word and
    // practices the shared entry (advancing its local schedule).
    wipeDB();
    await importArchive(parseArchive(earlyBytes));
    const local = await saveEntryWithRecording({
      meaning: "only local",
      audio: { blob: makeBlob(16, 19), mimeType: "audio/webm", durationMs: 310 },
    });
    const db = await getDB();
    await db.put("revisit", {
      entryId: shared.entry.id,
      intervalIndex: 4,
      dueAt: 9_999_999_999_999,
    });

    const summary = await importArchive(parseArchive(lateBytes));
    expect(summary).toEqual({
      addedEntries: 1,
      addedAttempts: 1,
      skippedExisting: 1, // the shared entry
    });

    // Union of entries; nothing destroyed, nothing duplicated.
    const entryIds = (await db.getAll("entries")).map((e) => e.id).sort();
    expect(entryIds).toEqual(
      [shared.entry.id, extra.entry.id, local.entry.id].sort(),
    );
    // The archive attempt joined the existing shared entry.
    expect(await db.get("attempts", attempt.id)).toEqual(attempt);
    // The local revisit row for the existing entry is untouched.
    expect(await getRevisit(shared.entry.id)).toEqual({
      entryId: shared.entry.id,
      intervalIndex: 4,
      dueAt: 9_999_999_999_999,
    });
    // The new entry got the archive's revisit row.
    expect((await getRevisit(extra.entry.id))?.entryId).toBe(extra.entry.id);
    // The local dictionary row survives; the imported entry joined it.
    expect((await db.getAll("dictionaries")).length).toBe(1);
  });

  it("rewrites imported entries onto the local dictionary id", async () => {
    await seedDictionary();
    const bytes = await archiveBytes();

    // A different device with its own dictionary (different id).
    wipeDB();
    const localEntry = await saveEntryWithRecording({
      meaning: "local word",
      audio: { blob: makeBlob(16, 23), mimeType: "audio/webm", durationMs: 300 },
    });
    const localDictId = localEntry.entry.dictionaryId;

    await importArchive(parseArchive(bytes));
    const db = await getDB();
    expect((await db.getAll("dictionaries")).map((d) => d.id)).toEqual([
      localDictId,
    ]);
    for (const entry of await db.getAll("entries")) {
      expect(entry.dictionaryId).toBe(localDictId);
    }
  });

  it("defaults the revisit row to due-at-creation when the archive lacks one", async () => {
    const { entry } = await saveEntryWithRecording({
      meaning: "no schedule in the file",
      audio: { blob: makeBlob(16, 29), mimeType: "audio/webm", durationMs: 300 },
    });
    const bytes = await archiveBytes();

    wipeDB();
    const parsed = parseArchive(bytes);
    parsed.manifest.revisits = [];
    await importArchive(parsed);

    expect(await getRevisit(entry.id)).toEqual({
      entryId: entry.id,
      intervalIndex: 0,
      dueAt: entry.createdAt,
    });
  });
});

// ---- malformed archives -----------------------------------------------------

function manifestOf(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    format: "grandmas-dictionary",
    archiveVersion: 1,
    schemaVersion: 1,
    exportedAt: 1_757_900_000_000,
    dictionary: { id: "dict-1", createdAt: 1, schemaVersion: 1 },
    entries: [],
    elderRecordings: [],
    attempts: [],
    revisits: [],
    audio: [],
    ...overrides,
  };
}

function zipWithManifest(
  manifest: unknown,
  extraFiles: Record<string, Uint8Array> = {},
): ArrayBuffer {
  const zipped = zipSync({
    "dictionary.json": strToU8(JSON.stringify(manifest)),
    ...extraFiles,
  });
  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
}

function expectKind(fn: () => unknown, kind: ArchiveErrorKind) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ArchiveError);
    expect((err as ArchiveError).kind).toBe(kind);
    return;
  }
  throw new Error(`expected an ArchiveError of kind ${kind}`);
}

describe("parseArchive rejects malformed archives and writes nothing", () => {
  it("throws the right kind for each malformed case", async () => {
    await seedDictionary();
    const good = await archiveBytes();

    // Truncated bytes.
    expectKind(() => parseArchive(good.slice(0, 40)), "unreadable");
    // Not a zip at all.
    expectKind(
      () => parseArchive(new TextEncoder().encode("hello").buffer as ArrayBuffer),
      "unreadable",
    );
    // A zip with no dictionary.json.
    const noManifest = zipSync({ "readme.txt": strToU8("hi") });
    expectKind(
      () => parseArchive(noManifest.buffer as ArrayBuffer),
      "wrongFormat",
    );
    // dictionary.json that is not JSON.
    expectKind(
      () =>
        parseArchive(
          zipSync({ "dictionary.json": strToU8("{nope") }).buffer as ArrayBuffer,
        ),
      "unreadable",
    );
    // Wrong format marker.
    expectKind(
      () => parseArchive(zipWithManifest(manifestOf({ format: "other" }))),
      "wrongFormat",
    );
    // A future archive version.
    expectKind(
      () => parseArchive(zipWithManifest(manifestOf({ archiveVersion: 2 }))),
      "newerVersion",
    );
    // A future schema version.
    expectKind(
      () => parseArchive(zipWithManifest(manifestOf({ schemaVersion: 2 }))),
      "newerVersion",
    );
    // Referenced audio file missing from the zip.
    expectKind(
      () =>
        parseArchive(
          zipWithManifest(
            manifestOf({
              audio: [
                {
                  id: "a1",
                  path: "audio/a1.webm",
                  mimeType: "audio/webm",
                  sizeBytes: 4,
                },
              ],
            }),
          ),
        ),
      "invalid",
    );
    // Dangling audioBlobId on a recording.
    expectKind(
      () =>
        parseArchive(
          zipWithManifest(
            manifestOf({
              elderRecordings: [
                { id: "r1", audioBlobId: "gone", durationMs: 1, recordedAt: 1 },
              ],
            }),
          ),
        ),
      "invalid",
    );
    // Attempt pointing at an entry the manifest does not carry.
    expectKind(
      () =>
        parseArchive(
          zipWithManifest(
            manifestOf({
              attempts: [
                {
                  id: "at1",
                  entryId: "gone",
                  audioBlobId: "gone",
                  durationMs: 1,
                  recordedAt: 1,
                },
              ],
            }),
          ),
        ),
      "invalid",
    );
    // Oversized declared audio.
    expectKind(
      () =>
        parseArchive(
          zipWithManifest(
            manifestOf({
              audio: [
                {
                  id: "a1",
                  path: "audio/a1.webm",
                  mimeType: "audio/webm",
                  sizeBytes: 26 * 1024 * 1024,
                },
              ],
            }),
            { "audio/a1.webm": new Uint8Array(4) },
          ),
        ),
      "invalid",
    );
    // Over-cap row counts.
    const tooManyEntries = Array.from({ length: 10_001 }, (_, i) => ({
      id: `e${i}`,
      dictionaryId: "dict-1",
      meaning: "w",
      category: "c",
      elderRecordingId: "r",
      createdAt: 1,
    }));
    expectKind(
      () =>
        parseArchive(zipWithManifest(manifestOf({ entries: tooManyEntries }))),
      "invalid",
    );
    // Input file over the size cap.
    expectKind(() => parseArchive(good, { maxBytes: 16 }), "tooLarge");

    // None of the failures touched the database.
    expect(await storeCounts()).toEqual({
      dictionaries: 1,
      entries: 2,
      elderRecordings: 2,
      attempts: 1,
      audioBlobs: 3,
      revisit: 2,
    });
    // And the good archive still parses.
    expect(parseArchive(good).manifest.entries.length).toBe(2);
  });

  it("caps oversized strings", async () => {
    expectKind(
      () =>
        parseArchive(
          zipWithManifest(manifestOf({ dictionary: { id: "x".repeat(101), createdAt: 1, schemaVersion: 1 } })),
        ),
      "invalid",
    );
  });
});

describe("importArchive atomicity", () => {
  it("leaves prior data intact when the transaction fails mid-import", async () => {
    await seedDictionary();
    const bytes = await archiveBytes();

    wipeDB();
    await saveEntryWithRecording({
      meaning: "already mine",
      audio: { blob: makeBlob(16, 31), mimeType: "audio/webm", durationMs: 300 },
    });
    const before = await storeCounts();

    // Poison one attempt row with an uncloneable value: the put fails after
    // entry puts were already issued, so only a full abort keeps us safe.
    const parsed: ParsedArchive = parseArchive(bytes);
    parsed.manifest.attempts = parsed.manifest.attempts.map((a) => ({
      ...a,
      recordedAt: (() => 0) as unknown as number,
    })) as Attempt[];

    await expect(importArchive(parsed)).rejects.toThrow();

    // Nothing from the archive landed: no partial entries, blobs, or revisits.
    expect(await storeCounts()).toEqual(before);
  });
});
