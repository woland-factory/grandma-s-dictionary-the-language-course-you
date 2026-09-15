import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { MAX_AUDIO_BYTES, MAX_MEANING, MAX_WRITTEN_FORM } from "./audio";
import {
  SCHEMA_VERSION,
  getDB,
  getOrCreateDictionary,
  type Attempt,
  type Dictionary,
  type ElderRecording,
  type Entry,
  type Revisit,
} from "./db";

// The heirloom file: one zip holding the whole dictionary. `dictionary.json`
// is a readable manifest; each audio blob is stored beside it under `audio/`
// at compression level 0 (audio is already compressed; level 0 keeps export
// fast and the file openable by hand).

export const ARCHIVE_FORMAT = "grandmas-dictionary";
export const ARCHIVE_VERSION = 1;
export const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024; // refuse files over 1 GB

const MAX_ID_CHARS = 100;
const MAX_CATEGORY_CHARS = 100;
const MAX_MIME_CHARS = 100;
const MAX_FAMILY_NAME_CHARS = 200;
const MAX_ENTRY_ROWS = 10_000;
const MAX_ATTEMPT_ROWS = 50_000;
const MAX_AUDIO_ROWS = 60_000;

export type ArchiveErrorKind =
  | "unreadable"
  | "wrongFormat"
  | "newerVersion"
  | "invalid"
  | "tooLarge";

// Typed failure for the whole read path. The UI maps `kind` to designed copy;
// the message is for logs and tests, never shown to the user.
export class ArchiveError extends Error {
  kind: ArchiveErrorKind;
  constructor(kind: ArchiveErrorKind, message: string) {
    super(message);
    this.name = "ArchiveError";
    this.kind = kind;
  }
}

export interface ManifestAudio {
  id: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ArchiveManifest {
  format: string;
  archiveVersion: number;
  schemaVersion: number;
  exportedAt: number;
  dictionary: Dictionary;
  entries: Entry[];
  elderRecordings: ElderRecording[];
  attempts: Attempt[];
  revisits: Revisit[];
  audio: ManifestAudio[];
}

export interface ParsedArchive {
  manifest: ArchiveManifest;
  audioBytes: Map<string, Uint8Array>; // audio row id -> bytes from the zip
}

export interface ImportSummary {
  addedEntries: number;
  addedAttempts: number;
  skippedExisting: number; // entries + attempts already present locally
}

// Cosmetic extension for a human opening the zip by hand. The manifest's
// mimeType stays authoritative on import.
function extFromMime(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/wav":
      return "wav";
    default:
      return "bin";
  }
}

function dateStamp(ts: number): string {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// ---- export -----------------------------------------------------------------

// Reads all six stores in full (never the capped UI list paths) and assembles
// the zip in memory. The validation caps on import bound the same sizes here.
export async function buildArchive(): Promise<{ blob: Blob; filename: string }> {
  const dictionary = await getOrCreateDictionary();
  const db = await getDB();
  const [entries, elderRecordings, attempts, revisits, audioRows] =
    await Promise.all([
      db.getAll("entries"),
      db.getAll("elderRecordings"),
      db.getAll("attempts"),
      db.getAll("revisit"),
      db.getAll("audioBlobs"),
    ]);

  const files: Zippable = {};
  const audio: ManifestAudio[] = [];
  for (const row of audioRows) {
    const path = `audio/${row.id}.${extFromMime(row.mimeType)}`;
    const bytes = new Uint8Array(await row.blob.arrayBuffer());
    files[path] = [bytes, { level: 0 }];
    audio.push({
      id: row.id,
      path,
      mimeType: row.mimeType,
      sizeBytes: bytes.byteLength,
    });
  }

  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    archiveVersion: ARCHIVE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    dictionary,
    entries,
    elderRecordings,
    attempts,
    revisits,
    audio,
  };
  // JSON.stringify drops undefined-valued optional fields (writtenForm,
  // promptId, familyName), matching the locked manifest shape.
  files["dictionary.json"] = strToU8(JSON.stringify(manifest));

  const zipped = zipSync(files);
  return {
    blob: new Blob([zipped], { type: "application/zip" }),
    filename: `grandmas-dictionary-${dateStamp(manifest.exportedAt)}.zip`,
  };
}

// The one export path: build the zip and hand it to the browser's download
// mechanism. The object URL is revoked after the download has had time to
// start (revoking synchronously can abort it).
export async function downloadArchive(): Promise<void> {
  const { blob, filename } = await buildArchive();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ---- parse & validate -------------------------------------------------------

function invalid(message: string): never {
  throw new ArchiveError("invalid", message);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) invalid(`${what} must be a number`);
  return v;
}

function asString(v: unknown, max: number, what: string): string {
  if (typeof v !== "string" || v.length > max) invalid(`${what} must be a string of at most ${max} chars`);
  return v;
}

function asId(v: unknown, what: string): string {
  const s = asString(v, MAX_ID_CHARS, what);
  if (s.length === 0) invalid(`${what} must not be empty`);
  return s;
}

function asArray(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) invalid(`${what} must be an array`);
  return v;
}

// Full validation before any write is possible: structure, string and count
// caps, then referential integrity. Unknown extra fields are dropped, never
// fatal, so a future minor format can add fields without breaking us.
export function parseArchive(
  bytes: ArrayBuffer,
  opts: { maxBytes?: number } = {},
): ParsedArchive {
  const maxBytes = opts.maxBytes ?? MAX_ARCHIVE_BYTES;
  if (bytes.byteLength > maxBytes) {
    throw new ArchiveError("tooLarge", "archive is over the size cap");
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(bytes));
  } catch {
    throw new ArchiveError("unreadable", "not a readable zip file");
  }

  const manifestBytes = files["dictionary.json"];
  if (!manifestBytes) {
    throw new ArchiveError("wrongFormat", "dictionary.json is missing");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new ArchiveError("unreadable", "dictionary.json is not valid JSON");
  }

  if (!isRecord(raw) || raw.format !== ARCHIVE_FORMAT) {
    throw new ArchiveError("wrongFormat", "not a dictionary archive");
  }
  const archiveVersion = raw.archiveVersion;
  if (typeof archiveVersion !== "number") invalid("archiveVersion missing");
  if (archiveVersion > ARCHIVE_VERSION) {
    throw new ArchiveError("newerVersion", "archive version is newer than this app");
  }
  if (archiveVersion !== ARCHIVE_VERSION) invalid("unknown archiveVersion");
  const schemaVersion = asNumber(raw.schemaVersion, "schemaVersion");
  if (schemaVersion > SCHEMA_VERSION) {
    throw new ArchiveError("newerVersion", "schema version is newer than this app");
  }
  const exportedAt = asNumber(raw.exportedAt, "exportedAt");

  const rawEntries = asArray(raw.entries, "entries");
  const rawRecordings = asArray(raw.elderRecordings, "elderRecordings");
  const rawAttempts = asArray(raw.attempts, "attempts");
  const rawRevisits = asArray(raw.revisits, "revisits");
  const rawAudio = asArray(raw.audio, "audio");
  if (rawEntries.length > MAX_ENTRY_ROWS) invalid("too many entries");
  if (rawAttempts.length > MAX_ATTEMPT_ROWS) invalid("too many attempts");
  if (rawAudio.length > MAX_AUDIO_ROWS) invalid("too many audio rows");

  if (!isRecord(raw.dictionary)) invalid("dictionary must be an object");
  const dictionary: Dictionary = {
    id: asId(raw.dictionary.id, "dictionary.id"),
    createdAt: asNumber(raw.dictionary.createdAt, "dictionary.createdAt"),
    schemaVersion: asNumber(raw.dictionary.schemaVersion, "dictionary.schemaVersion"),
  };
  if (raw.dictionary.familyName !== undefined) {
    dictionary.familyName = asString(
      raw.dictionary.familyName,
      MAX_FAMILY_NAME_CHARS,
      "dictionary.familyName",
    );
  }

  const audioBytes = new Map<string, Uint8Array>();
  const audio: ManifestAudio[] = rawAudio.map((v, i) => {
    if (!isRecord(v)) invalid(`audio[${i}] must be an object`);
    const id = asId(v.id, `audio[${i}].id`);
    const path = asString(v.path, 200, `audio[${i}].path`);
    const declaredSize = asNumber(v.sizeBytes, `audio[${i}].sizeBytes`);
    if (declaredSize < 0 || declaredSize > MAX_AUDIO_BYTES) {
      invalid(`audio[${i}] declares an oversized file`);
    }
    const data = files[path];
    if (!data) invalid(`audio[${i}] file ${path} is missing from the zip`);
    if (data.byteLength > MAX_AUDIO_BYTES) invalid(`audio[${i}] file is oversized`);
    audioBytes.set(id, data);
    return {
      id,
      path,
      mimeType: asString(v.mimeType, MAX_MIME_CHARS, `audio[${i}].mimeType`),
      sizeBytes: declaredSize,
    };
  });
  const audioIds = new Set(audio.map((a) => a.id));

  const elderRecordings: ElderRecording[] = rawRecordings.map((v, i) => {
    if (!isRecord(v)) invalid(`elderRecordings[${i}] must be an object`);
    const audioBlobId = asId(v.audioBlobId, `elderRecordings[${i}].audioBlobId`);
    if (!audioIds.has(audioBlobId)) {
      invalid(`elderRecordings[${i}] points at a missing audio row`);
    }
    return {
      id: asId(v.id, `elderRecordings[${i}].id`),
      audioBlobId,
      durationMs: asNumber(v.durationMs, `elderRecordings[${i}].durationMs`),
      recordedAt: asNumber(v.recordedAt, `elderRecordings[${i}].recordedAt`),
    };
  });
  const recordingIds = new Set(elderRecordings.map((r) => r.id));

  const entries: Entry[] = rawEntries.map((v, i) => {
    if (!isRecord(v)) invalid(`entries[${i}] must be an object`);
    const elderRecordingId = asId(v.elderRecordingId, `entries[${i}].elderRecordingId`);
    if (!recordingIds.has(elderRecordingId)) {
      invalid(`entries[${i}] points at a missing elder recording`);
    }
    const entry: Entry = {
      id: asId(v.id, `entries[${i}].id`),
      dictionaryId: asId(v.dictionaryId, `entries[${i}].dictionaryId`),
      meaning: asString(v.meaning, MAX_MEANING, `entries[${i}].meaning`),
      category: asString(v.category, MAX_CATEGORY_CHARS, `entries[${i}].category`),
      elderRecordingId,
      createdAt: asNumber(v.createdAt, `entries[${i}].createdAt`),
    };
    if (v.writtenForm !== undefined) {
      entry.writtenForm = asString(v.writtenForm, MAX_WRITTEN_FORM, `entries[${i}].writtenForm`);
    }
    if (v.promptId !== undefined) {
      entry.promptId = asString(v.promptId, MAX_ID_CHARS, `entries[${i}].promptId`);
    }
    return entry;
  });
  const entryIds = new Set(entries.map((e) => e.id));

  const attempts: Attempt[] = rawAttempts.map((v, i) => {
    if (!isRecord(v)) invalid(`attempts[${i}] must be an object`);
    const entryId = asId(v.entryId, `attempts[${i}].entryId`);
    if (!entryIds.has(entryId)) invalid(`attempts[${i}] points at a missing entry`);
    const audioBlobId = asId(v.audioBlobId, `attempts[${i}].audioBlobId`);
    if (!audioIds.has(audioBlobId)) {
      invalid(`attempts[${i}] points at a missing audio row`);
    }
    return {
      id: asId(v.id, `attempts[${i}].id`),
      entryId,
      audioBlobId,
      durationMs: asNumber(v.durationMs, `attempts[${i}].durationMs`),
      recordedAt: asNumber(v.recordedAt, `attempts[${i}].recordedAt`),
    };
  });

  const revisits: Revisit[] = rawRevisits.map((v, i) => {
    if (!isRecord(v)) invalid(`revisits[${i}] must be an object`);
    const entryId = asId(v.entryId, `revisits[${i}].entryId`);
    if (!entryIds.has(entryId)) invalid(`revisits[${i}] points at a missing entry`);
    return {
      entryId,
      intervalIndex: asNumber(v.intervalIndex, `revisits[${i}].intervalIndex`),
      dueAt: asNumber(v.dueAt, `revisits[${i}].dueAt`),
    };
  });

  return {
    manifest: {
      format: ARCHIVE_FORMAT,
      archiveVersion,
      schemaVersion,
      exportedAt,
      dictionary,
      entries,
      elderRecordings,
      attempts,
      revisits,
      audio,
    },
    audioBytes,
  };
}

// ---- merge & import ---------------------------------------------------------

// Applies a validated archive in ONE readwrite transaction. Identity is the
// row id: rows whose id already exists locally are skipped, everything else is
// added, so re-importing your own file is a no-op. All-or-nothing: any failure
// aborts the transaction and the dictionary stays exactly as it was.
export async function importArchive(
  parsed: ParsedArchive,
): Promise<ImportSummary> {
  const db = await getDB();
  const { manifest, audioBytes } = parsed;

  // Blob construction happens before the transaction opens; IndexedDB
  // transactions auto-commit if control leaves the request chain.
  const blobById = new Map<string, { blob: Blob; sizeBytes: number }>();
  for (const a of manifest.audio) {
    const bytes = audioBytes.get(a.id);
    if (!bytes) invalid(`audio bytes for ${a.id} are missing`);
    blobById.set(a.id, {
      blob: new Blob([bytes], { type: a.mimeType }),
      sizeBytes: bytes.byteLength,
    });
  }

  const tx = db.transaction(
    ["dictionaries", "entries", "elderRecordings", "attempts", "audioBlobs", "revisit"],
    "readwrite",
  );
  const puts: Promise<unknown>[] = [];
  try {
    const [localDicts, entryKeys, recordingKeys, attemptKeys, audioKeys] =
      await Promise.all([
        tx.objectStore("dictionaries").getAll(),
        tx.objectStore("entries").getAllKeys(),
        tx.objectStore("elderRecordings").getAllKeys(),
        tx.objectStore("attempts").getAllKeys(),
        tx.objectStore("audioBlobs").getAllKeys(),
      ]);
    const haveEntry = new Set(entryKeys);
    const haveRecording = new Set(recordingKeys);
    const haveAttempt = new Set(attemptKeys);
    const haveAudio = new Set(audioKeys);
    const revisitByEntry = new Map(manifest.revisits.map((r) => [r.entryId, r]));
    let addedEntries = 0;
    let addedAttempts = 0;
    let skippedExisting = 0;

    // Fresh profile: restore the archive's dictionary row as-is (id and
    // familyName preserved). Otherwise the local row stays untouched and
    // imported entries join it.
    let dictionaryId: string;
    if (localDicts.length === 0) {
      dictionaryId = manifest.dictionary.id;
      puts.push(tx.objectStore("dictionaries").put(manifest.dictionary));
    } else {
      dictionaryId = localDicts[0].id;
    }

    for (const entry of manifest.entries) {
      if (haveEntry.has(entry.id)) {
        skippedExisting += 1;
        continue;
      }
      addedEntries += 1;
      puts.push(tx.objectStore("entries").put({ ...entry, dictionaryId }));
      // New entries take the archive's schedule, or become due at their
      // creation time. Local entries keep their local revisit row.
      const revisit = revisitByEntry.get(entry.id) ?? {
        entryId: entry.id,
        intervalIndex: 0,
        dueAt: entry.createdAt,
      };
      puts.push(tx.objectStore("revisit").put(revisit));
    }

    for (const recording of manifest.elderRecordings) {
      if (haveRecording.has(recording.id)) continue;
      puts.push(tx.objectStore("elderRecordings").put(recording));
    }

    for (const attempt of manifest.attempts) {
      if (haveAttempt.has(attempt.id)) {
        skippedExisting += 1;
        continue;
      }
      addedAttempts += 1;
      puts.push(tx.objectStore("attempts").put(attempt));
    }

    for (const a of manifest.audio) {
      if (haveAudio.has(a.id)) continue;
      const built = blobById.get(a.id)!;
      puts.push(
        tx.objectStore("audioBlobs").put({
          id: a.id,
          blob: built.blob,
          mimeType: a.mimeType,
          sizeBytes: built.sizeBytes,
        }),
      );
    }

    await Promise.all([...puts, tx.done]);
    return { addedEntries, addedAttempts, skippedExisting };
  } catch (err) {
    // A synchronous put failure (for example a value that cannot be cloned)
    // would otherwise let already-issued puts commit; abort to keep the
    // import all-or-nothing. The abort makes every pending request reject,
    // so mark them handled before aborting.
    for (const p of puts) {
      void p.catch(() => {});
    }
    void tx.done.catch(() => {});
    try {
      tx.abort();
    } catch {
      // Already aborted or completed.
    }
    throw err;
  }
}
