import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { newId } from "./id";

// Forward-only schema. Bump DB_VERSION and add a NEW `case` in the upgrade
// switch for each future version; never mutate data written by an earlier
// version in place. Later EPICs add stores (attempts, revisit fields) this
// way without rewriting existing rows.
export const DB_NAME = "grandmas-dictionary";
export const DB_VERSION = 1;
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
}

let dbPromise: Promise<IDBPDatabase<GrandmaDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<GrandmaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GrandmaDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Forward-only migrations. Each version is its own case; a future
        // version adds `case 1:` (etc.) below and creates new stores. It must
        // never delete or rewrite stores created by an earlier version.
        switch (oldVersion) {
          case 0:
            db.createObjectStore("meta", { keyPath: "key" });
            db.createObjectStore("dictionaries", { keyPath: "id" });
            {
              const entries = db.createObjectStore("entries", {
                keyPath: "id",
              });
              entries.createIndex("by-createdAt", "createdAt");
            }
            db.createObjectStore("elderRecordings", { keyPath: "id" });
            db.createObjectStore("audioBlobs", { keyPath: "id" });
          // falls through so a DB upgrading across several versions runs every
          // later case in order.
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

  const tx = db.transaction(
    ["audioBlobs", "elderRecordings", "entries"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("audioBlobs").put(audioBlob),
    tx.objectStore("elderRecordings").put(recording),
    tx.objectStore("entries").put(entry),
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
