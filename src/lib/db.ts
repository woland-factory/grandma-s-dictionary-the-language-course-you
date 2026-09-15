import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { newId } from "./id";
import { nextRevisit } from "./revisit";

// Forward-only schema. Bump DB_VERSION and add a NEW `case` in the upgrade
// switch for each future version; never mutate data written by an earlier
// version in place. Later EPICs add stores (attempts, revisit fields) this
// way without rewriting existing rows.
export const DB_NAME = "grandmas-dictionary";
export const DB_VERSION = 2;
export const SCHEMA_VERSION = 1;

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface Dictionary {
  id: string;
  familyName?: string;
  createdAt: number;
  schemaVersion: number;
}

export interface Entry {
  id: string;
  dictionaryId: string;
  writtenForm?: string;
  meaning: string;
  category: string;
  promptId?: string;
  elderRecordingId: string;
  createdAt: number;
}

export interface ElderRecording {
  id: string;
  audioBlobId: string;
  durationMs: number;
  recordedAt: number;
}

export interface AudioBlobRow {
  id: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
}

// A child's record-back for an entry. Attempts only accumulate; a new one never
// overwrites the elder original or a prior attempt.
export interface Attempt {
  id: string;
  entryId: string;
  audioBlobId: string; // points into the existing audioBlobs store
  durationMs: number;
  recordedAt: number; // ms epoch; the attempt's date
}

// The spaced-revisit row for an entry: one row per entry, keyed by entryId.
export interface Revisit {
  entryId: string;
  intervalIndex: number; // 0 = new / never practiced
  dueAt: number; // ms epoch; the entry is due when dueAt <= now
}

interface GrandmaDB extends DBSchema {
  meta: {
    key: string;
    value: MetaRow;
  };
  dictionaries: {
    key: string;
    value: Dictionary;
  };
  entries: {
    key: string;
    value: Entry;
    indexes: { "by-createdAt": number };
  };
  elderRecordings: {
    key: string;
    value: ElderRecording;
  };
  audioBlobs: {
    key: string;
    value: AudioBlobRow;
  };
  attempts: {
    key: string;
    value: Attempt;
    indexes: { "by-entry": string };
  };
  revisit: {
    key: string;
    value: Revisit;
    indexes: { "by-dueAt": number };
  };
}

let dbPromise: Promise<IDBPDatabase<GrandmaDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<GrandmaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GrandmaDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        // Forward-only migrations. Each version's block creates only new stores
        // and never deletes or rewrites stores from an earlier version. The
        // `oldVersion < N` guards mean a fresh DB (oldVersion 0) runs every
        // block in order, while an existing v1 DB runs only the v2 block.
        if (oldVersion < 1) {
          // v1: the original capture schema.
          db.createObjectStore("meta", { keyPath: "key" });
          db.createObjectStore("dictionaries", { keyPath: "id" });
          const entries = db.createObjectStore("entries", { keyPath: "id" });
          entries.createIndex("by-createdAt", "createdAt");
          db.createObjectStore("elderRecordings", { keyPath: "id" });
          db.createObjectStore("audioBlobs", { keyPath: "id" });
        }
        if (oldVersion < 2) {
          // v2: attempts (child record-backs) and the spaced-revisit schedule.
          const attempts = db.createObjectStore("attempts", { keyPath: "id" });
          attempts.createIndex("by-entry", "entryId");
          const revisit = db.createObjectStore("revisit", {
            keyPath: "entryId",
          });
          revisit.createIndex("by-dueAt", "dueAt");
          // Additive backfill: every existing entry becomes due immediately
          // (dueAt = its createdAt) so pre-EPIC-3 words appear in practice.
          // Uses the upgrade transaction (awaited so it stays open); it reads
          // entries but never mutates an entries row.
          const existing = await tx.objectStore("entries").getAll();
          const revisitStore = tx.objectStore("revisit");
          for (const entry of existing) {
            await revisitStore.put({
              entryId: entry.id,
              intervalIndex: 0,
              dueAt: entry.createdAt,
            });
          }
        }
      },
    });
  }
  return dbPromise;
}

// For tests only: reset the memoized connection so a fresh fake-indexeddb is
// picked up between cases.
export function _resetDBForTests(): void {
  dbPromise = null;
}

// ---- meta flags -------------------------------------------------------------

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const row = await db.get("meta", key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value });
}

// ---- dictionary -------------------------------------------------------------

// Returns the single local dictionary, creating it on first use. The product
// keeps one dictionary per device in this EPIC.
export async function getOrCreateDictionary(): Promise<Dictionary> {
  const db = await getDB();
  const all = await db.getAll("dictionaries");
  if (all.length > 0) return all[0];
  const dict: Dictionary = {
    id: newId(),
    createdAt: Date.now(),
    schemaVersion: SCHEMA_VERSION,
  };
  await db.put("dictionaries", dict);
  return dict;
}

// ---- entries ----------------------------------------------------------------

export interface NewEntryInput {
  writtenForm?: string;
  meaning: string;
  category?: string;
  promptId?: string;
  audio: {
    blob: Blob;
    mimeType: string;
    durationMs: number;
  };
}

export interface SavedEntry {
  entry: Entry;
  recording: ElderRecording;
}

// Saves an entry together with its elder recording and audio blob in ONE
// readwrite transaction across all three stores, so a failure cannot leave an
// orphaned blob or a recording with no entry.
export async function saveEntryWithRecording(
  input: NewEntryInput,
): Promise<SavedEntry> {
  const dictionary = await getOrCreateDictionary();
  const db = await getDB();
  const now = Date.now();

  const blobId = newId();
  const recordingId = newId();
  const entryId = newId();

  const audioBlob: AudioBlobRow = {
    id: blobId,
    blob: input.audio.blob,
    mimeType: input.audio.mimeType,
    sizeBytes: input.audio.blob.size,
  };
  const recording: ElderRecording = {
    id: recordingId,
    audioBlobId: blobId,
    durationMs: input.audio.durationMs,
    recordedAt: now,
  };
  const entry: Entry = {
    id: entryId,
    dictionaryId: dictionary.id,
    writtenForm: input.writtenForm,
    meaning: input.meaning,
    category: input.category ?? "uncategorized",
    promptId: input.promptId,
    elderRecordingId: recordingId,
    createdAt: now,
  };

  const revisit: Revisit = {
    entryId,
    intervalIndex: 0,
    dueAt: now,
  };

  const tx = db.transaction(
    ["audioBlobs", "elderRecordings", "entries", "revisit"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("audioBlobs").put(audioBlob),
    tx.objectStore("elderRecordings").put(recording),
    tx.objectStore("entries").put(entry),
    tx.objectStore("revisit").put(revisit),
    tx.done,
  ]);

  return { entry, recording };
}

// Lists entries newest first through the by-createdAt index (no full-store
// scan-and-sort on the hot path). `limit` caps the list so it does not grow
// without bound as the family records more.
export async function listEntries(limit = 500): Promise<Entry[]> {
  const db = await getDB();
  const out: Entry[] = [];
  let cursor = await db
    .transaction("entries")
    .store.index("by-createdAt")
    .openCursor(null, "prev");
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const db = await getDB();
  return db.get("entries", id);
}

export async function getRecording(
  id: string,
): Promise<ElderRecording | undefined> {
  const db = await getDB();
  return db.get("elderRecordings", id);
}

export async function getAudioBlob(
  id: string,
): Promise<AudioBlobRow | undefined> {
  const db = await getDB();
  return db.get("audioBlobs", id);
}

// Convenience: resolve the playable audio blob for an entry via its recording.
export async function getEntryAudio(
  entry: Entry,
): Promise<AudioBlobRow | undefined> {
  const recording = await getRecording(entry.elderRecordingId);
  if (!recording) return undefined;
  return getAudioBlob(recording.audioBlobId);
}

export async function countEntries(): Promise<number> {
  const db = await getDB();
  return db.count("entries");
}

export async function countAttempts(): Promise<number> {
  const db = await getDB();
  return db.count("attempts");
}

// ---- attempts (child record-backs) & the revisit schedule -------------------

export interface AttemptAudioInput {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

// Stores a child's record-back as a NEW dated attempt beside the entry's elder
// recording. One readwrite transaction over audioBlobs, attempts, and revisit:
// it writes the blob, appends the attempt, and advances the entry's schedule so
// the same advance happens no matter which screen recorded it. The elder
// recording and every prior attempt are untouched.
export async function saveAttempt(
  entryId: string,
  audio: AttemptAudioInput,
): Promise<Attempt> {
  const db = await getDB();
  const now = Date.now();

  const blobId = newId();
  const audioBlob: AudioBlobRow = {
    id: blobId,
    blob: audio.blob,
    mimeType: audio.mimeType,
    sizeBytes: audio.blob.size,
  };
  const attempt: Attempt = {
    id: newId(),
    entryId,
    audioBlobId: blobId,
    durationMs: audio.durationMs,
    recordedAt: now,
  };

  const tx = db.transaction(
    ["audioBlobs", "attempts", "revisit"],
    "readwrite",
  );
  const revisitStore = tx.objectStore("revisit");
  const current = await revisitStore.get(entryId);
  const advanced = nextRevisit(current?.intervalIndex ?? 0, now);
  await Promise.all([
    tx.objectStore("audioBlobs").put(audioBlob),
    tx.objectStore("attempts").put(attempt),
    revisitStore.put({
      entryId,
      intervalIndex: advanced.intervalIndex,
      dueAt: advanced.dueAt,
    }),
    tx.done,
  ]);

  return attempt;
}

// Lists an entry's attempts newest first via the by-entry index, capped so the
// list cannot grow without bound as the family practices.
export async function listAttempts(
  entryId: string,
  limit = 200,
): Promise<Attempt[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex("attempts", "by-entry", entryId);
  rows.sort((a, b) => b.recordedAt - a.recordedAt);
  return rows.slice(0, limit);
}

export async function getLatestAttempt(
  entryId: string,
): Promise<Attempt | undefined> {
  const [latest] = await listAttempts(entryId, 1);
  return latest;
}

// Resolves the playable audio blob for an attempt via its audioBlobId.
export async function getAttemptAudio(
  attempt: Attempt,
): Promise<AudioBlobRow | undefined> {
  return getAudioBlob(attempt.audioBlobId);
}

// The practice queue: entries whose dueAt <= now, most overdue first, via the
// by-dueAt index (never a full-store scan). Skips revisit rows whose entry is
// missing. Capped so the hot path stays bounded.
export async function listDueEntries(
  now = Date.now(),
  limit = 100,
): Promise<Entry[]> {
  const db = await getDB();
  const out: Entry[] = [];
  const range = IDBKeyRange.upperBound(now);
  let cursor = await db
    .transaction("revisit")
    .store.index("by-dueAt")
    .openCursor(range, "next");
  const dueIds: string[] = [];
  while (cursor && dueIds.length < limit) {
    dueIds.push(cursor.value.entryId);
    cursor = await cursor.continue();
  }
  for (const id of dueIds) {
    const entry = await db.get("entries", id);
    if (entry) out.push(entry);
  }
  return out;
}

// Counts currently-due entries via the same index range (for the Home
// affordance). Capped so what we report stays bounded.
export async function countDueEntries(
  now = Date.now(),
  limit = 100,
): Promise<number> {
  const db = await getDB();
  const range = IDBKeyRange.upperBound(now);
  let cursor = await db
    .transaction("revisit")
    .store.index("by-dueAt")
    .openCursor(range, "next");
  let count = 0;
  while (cursor && count < limit) {
    count++;
    cursor = await cursor.continue();
  }
  return count;
}

export async function getRevisit(
  entryId: string,
): Promise<Revisit | undefined> {
  const db = await getDB();
  return db.get("revisit", entryId);
}
