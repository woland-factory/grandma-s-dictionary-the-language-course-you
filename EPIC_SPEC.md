# EPIC 4 SPEC — The heirloom file (export and import)

## Quality differentiator (this EPIC is held to it)

**Radical simplicity of capture.** A non-technical grandparent and a busy
parent produce a complete, playable, owned talking dictionary in one
kitchen-table sitting, with no account and no setup. This EPIC makes the
"owned" half true: the family walks away from the table with ONE file that
holds every voice, and can open it on any device without an account, a
sync service, or a technical relative.

What it demands of THIS EPIC's work: export is one tap that produces one
ordinary file the family can keep anywhere they already keep photos.
Import is one tap that opens that file. No format choices, no options
screen, no multi-step wizard, no explanation the user must read first.
A busy parent who has never heard the word "backup" must succeed on the
first try. Any extra tap, required decision, or unexplained failure on
the export or import path is a defect against the differentiator, not
just the baseline bar. The archive itself serves the north star: a human
who unzips it years from now finds a readable manifest and real audio
files, not an opaque blob.

---

## Scope

### In scope

- **Archive core** (`src/lib/archive.ts`): build one downloadable zip
  archive from the entire IndexedDB dictionary (dictionary row, every
  entry, elder recording, attempt, revisit row, and audio blob with its
  metadata), and read one back: parse, validate fully, compute a merge
  plan, and apply it in a single atomic transaction.
- **The data screen** (`/data`, `src/routes/Data.tsx`): storage status
  (bytes used, quota estimate, persisted or not, word and practice-take
  counts) with **export as the primary action** and import as the
  secondary action. A designed empty state when the dictionary is empty
  that leads with import instead.
- **Import result and error surfaces**: a success summary with real
  counts, and a designed error state for malformed, truncated, or
  wrong-version files that leaves the existing dictionary untouched.
- **Export nudge** (`src/components/ExportNudge.tsx`): a dismissible card
  on the interview session summary and on the practice caught-up screen,
  shown when that session saved at least one recording. Its button runs
  the export directly, so export is one tap from the nudge.
- **Home entry point**: a subordinate link to `/data` when entries exist.
- **Dependency**: `fflate` (pinned) for zip read and write. No other new
  dependency.
- **README**: replace the "Export arrives in a later release." sentence
  with a short, accurate description of export and import.

### Out of scope (Non-goals — binding, do NOT build)

- **No cloud storage.** The file goes to the device's own download
  mechanism and nowhere else. No upload, no server endpoint, no storage
  API of any provider.
- **No sharing links.** No URLs that carry or reference family data, no
  Web Share targets to social surfaces, no QR codes.
- **No multi-family merge tooling.** Import merges an archive into the
  one local dictionary. No conflict-resolution UI, no side-by-side diff,
  no choosing per-entry winners, no managing several dictionaries.
- **No server-side backup.** The app stays a static client with no
  application API. Nothing about this EPIC adds a server route.
- **No automatic or scheduled backups**, no reminders outside the two
  named nudge points, no mail (do not wire the central mailer).
- **No content-hash deduplication.** "Identical" means "same id" (see
  merge semantics below). Detecting that two separately recorded rows
  contain the same audio bytes is explicitly out of scope.
- **No archive editing, partial export, or format options.** One button,
  one file, everything in it.
- **No guided first-run walkthrough overlay** (EPIC 5).

### Security / data posture (unchanged; restate so reviewers do not mis-flag)

This remains a static client with no application API. Export writes a file
to the user's own device through the browser download mechanism; import
reads a file the user chose. No family data leaves the device over the
network. QUALITY BAR §5 is met at the client boundary: the import path
validates types, sizes, counts, and referential integrity before any
write (details below), and a failed validation writes nothing. Server-side
authorization and rate limiting stay N/A because no mutation route exists.
Telemetry must not change posture: no new event may carry entry text,
audio, filenames, ids, or archive contents, and import errors reported to
error tracking must not attach file contents (the existing `scrubEvent`
already strips extras; do not work around it).

---

## Technical design

### No database migration

The v2 schema already holds everything the archive needs. `DB_VERSION`
stays 2; no store or index changes. Do not touch the upgrade switch in
`src/lib/db.ts`. The archive carries `SCHEMA_VERSION` (currently 1) so a
future schema can refuse or upgrade old archives explicitly.

### Archive format (locked)

One zip file, built and read with `fflate`. Layout:

```
grandmas-dictionary-<YYYY-MM-DD>.zip
├── dictionary.json          # the manifest (compressed)
└── audio/<audioBlobId>.<ext> # one file per audioBlobs row, stored at
                              # compression level 0 (audio is already
                              # compressed; level 0 keeps export fast)
```

`<ext>` is cosmetic, derived from `mimeType` (`webm` for audio/webm,
`m4a` for audio/mp4, `aac` for audio/aac, `wav` for audio/wav, `bin`
otherwise). The manifest's `mimeType` is authoritative on import; the
extension is for a human opening the zip by hand. `<YYYY-MM-DD>` comes
from the export timestamp.

`dictionary.json` (manifest, `archiveVersion` 1):

```json
{
  "format": "grandmas-dictionary",
  "archiveVersion": 1,
  "schemaVersion": 1,
  "exportedAt": 1757900000000,
  "dictionary": { "id": "…", "familyName": "…", "createdAt": 0, "schemaVersion": 1 },
  "entries": [ { "id": "…", "dictionaryId": "…", "writtenForm": "…", "meaning": "…", "category": "…", "promptId": "…", "elderRecordingId": "…", "createdAt": 0 } ],
  "elderRecordings": [ { "id": "…", "audioBlobId": "…", "durationMs": 0, "recordedAt": 0 } ],
  "attempts": [ { "id": "…", "entryId": "…", "audioBlobId": "…", "durationMs": 0, "recordedAt": 0 } ],
  "revisits": [ { "entryId": "…", "intervalIndex": 0, "dueAt": 0 } ],
  "audio": [ { "id": "…", "path": "audio/….webm", "mimeType": "audio/webm", "sizeBytes": 0 } ]
}
```

Row shapes mirror the interfaces in `src/lib/db.ts` verbatim (optional
fields omitted when absent). Unknown extra fields in an imported manifest
are ignored, never fatal (forward compatibility).

### `src/lib/archive.ts` API (locked responsibilities, names indicative)

- `buildArchive(): Promise<{ blob: Blob; filename: string }>` — reads all
  six stores via `getDB()` (`getAll` per store, never the capped
  `listEntries`), assembles the zip in memory, returns a Blob with type
  `application/zip`. Export must include EVERY row, beyond any UI list
  cap.
- `downloadArchive(): Promise<void>` — calls `buildArchive`, then
  triggers the download via an object URL on a temporary
  `<a download="…">` element, and revokes the URL. This is the one
  export path; the data screen and the nudge both call it.
- `parseArchive(bytes: ArrayBuffer): ParsedArchive` — unzip, parse
  `dictionary.json`, validate. Throws a typed `ArchiveError` with a
  `kind` (`"unreadable" | "wrongFormat" | "newerVersion" | "invalid" |
  "tooLarge"`) that the UI maps to designed error copy. Validation is
  COMPLETE before any write is possible:
  - zip opens and `dictionary.json` exists and parses;
  - `format === "grandmas-dictionary"`; `archiveVersion === 1` and
    `schemaVersion <= SCHEMA_VERSION` (greater values are
    `newerVersion`);
  - every array has the right shape and types; strings capped
    (`writtenForm` ≤ `MAX_WRITTEN_FORM`, `meaning` ≤ `MAX_MEANING`,
    `category` ≤ 100, ids ≤ 100 chars);
  - counts capped: ≤ 10,000 entries, ≤ 50,000 attempts, ≤ 60,000 audio
    rows; input file ≤ 1 GB (`tooLarge`);
  - referential integrity: every `entry.elderRecordingId` resolves to a
    recording, every recording and attempt `audioBlobId` resolves to an
    `audio` row, every `audio.path` exists in the zip, every
    `attempt.entryId` and `revisits[].entryId` resolves to an entry in
    the manifest; each audio file ≤ `MAX_AUDIO_BYTES`.
- `importArchive(parsed: ParsedArchive): Promise<ImportSummary>` —
  computes the merge plan (below) against the live DB, then applies it
  in ONE `readwrite` transaction across `dictionaries`, `entries`,
  `elderRecordings`, `attempts`, `audioBlobs`, and `revisit`. Returns
  `{ addedEntries, addedAttempts, skippedExisting }`. All-or-nothing: a
  transaction failure leaves the dictionary exactly as it was.

### Merge semantics (locked — the implementer decides nothing here)

Identity is the row `id` (ids are long random strings from `newId`, so
equal ids mean the same original capture; this is what makes re-importing
your own file a no-op).

- **Dictionary row**: if the local `dictionaries` store is empty, put the
  archive's dictionary row as-is (fresh-profile restore preserves id and
  `familyName`). Otherwise keep the local row untouched and rewrite the
  `dictionaryId` of every imported entry to the local dictionary's id.
- **Entries, elder recordings, attempts, audio blobs**: skip any row
  whose id already exists locally; add the rest. An archive attempt
  whose `entryId` matches an EXISTING local entry is imported (that is
  the merge value: new takes join the entry they belong to).
- **Revisit**: for imported (new) entries, take the archive's revisit
  row, or `{ intervalIndex: 0, dueAt: entry.createdAt }` when the
  archive lacks one. For entries that already exist locally, leave the
  local revisit row untouched.
- **Audio bytes** become `AudioBlobRow.blob` as a `Blob` with the
  manifest's `mimeType`; `sizeBytes` is recomputed from the actual bytes.
- Importing the same archive twice, or exporting and re-importing on the
  same device, adds zero rows and reports everything as already here.
- No interaction with the demo seed is needed: `maybeSeedDemo` already
  refuses to touch a non-empty dictionary, and an import on a
  `SEED_DEMO` deployment simply merges beside the demo words.

### The data screen (`/data`)

Registered in `src/App.tsx`. Content, top to bottom, at 390px:

- Heading: `Your family's file`.
- One-line subhead: `One file holds every word, every voice, and every
  practice take.`
- **Primary action**: `Save a backup` (`btn--primary btn--block`). On
  tap: pressed state within 100ms, inline `Preparing your file…` while
  building, then the download fires. Failure (quota, blob error) shows a
  designed error state with a retry, in the product's voice.
- Storage status: bytes used (and quota when available) via the existing
  `getStorageStatus` and `formatBytes`, the persisted badge, and word
  and practice-take counts (`countEntries` plus a new `countAttempts`
  in `src/lib/db.ts`). When not persisted, the badge becomes a button
  (`Keep on this device`) that calls the existing `requestPersistence`
  and refreshes. Layout held by a small skeleton while counts load.
- **Secondary action**: `Open a backup` (`btn--secondary btn--block`),
  a styled `<input type="file">` accepting
  `.zip,application/zip,application/x-zip-compressed`. While reading and
  validating: inline `Opening…` progress that holds layout. On success:
  a summary card, e.g. `Added 12 words and 3 practice takes.`, or
  `Everything in that file is already here.` when nothing was new, with
  a link to the dictionary. On failure: a designed error state (see
  copy below), the dictionary untouched.
- **Empty dictionary** (0 entries): a designed empty state instead of
  the above. Title `Bring your dictionary here`, body `Open a backup
  file from another device, or start recording to make one.`, with
  `Open a backup` as the primary action and a link to `/interview`.
  Export is hidden when there is nothing to export.

Error copy (locked, sweep-clean):
- Malformed/truncated/wrong format: title `That file did not open`, body
  `Choose a backup saved from this app, then try again. Your dictionary
  is unchanged.`, action `Choose another file`.
- Newer version: title `That backup needs a newer app`, body `Update
  this app on this device, then open the file again.`

### The export nudge

`src/components/ExportNudge.tsx`: a small card with title
`Keep today's words safe.`, primary button `Save a backup`, and a
`Not now` dismiss. The button calls `downloadArchive()` directly, shows
inline progress, and on success swaps to `Backup saved. Keep the file
somewhere safe.` Dismissal is component state only: the nudge returns
after the next session, which is exactly the planner's cadence. Shown at
two points, only when the session saved at least one recording (a nudge
with nothing new to save is noise):

- `InterviewSummary` in `src/routes/Interview.tsx`, when
  `capturedCount > 0`, below the summary heading and above the other
  actions.
- The caught-up screen in `src/routes/Practice.tsx`, when at least one
  attempt was saved this session (track a counter beside `index`).

### Home

In `src/routes/Home.tsx`, when `hasEntries`, add a ghost-level link
`Save a backup` navigating to `/data`, below the practice link. The
existing `StorageStatusBar` stays as-is.

### Files to add

```
src/lib/archive.ts             # build, download, parse/validate, merge, import
src/lib/archive.test.ts        # round-trip, merge, malformed-input unit tests
src/routes/Data.tsx            # the /data screen
src/routes/Data.test.tsx       # component tests for states and actions
src/components/ExportNudge.tsx # dismissible nudge with one-tap export
e2e/heirloom.spec.ts           # download + fresh-profile round-trip + merge e2e
```

### Files to change

```
package.json                # add fflate (pinned exact version)
src/App.tsx                 # register /data
src/lib/db.ts               # add countAttempts(); nothing else
src/routes/Home.tsx         # subordinate Save a backup link
src/routes/Interview.tsx    # nudge on the session summary
src/routes/Practice.tsx     # attempt counter + nudge on caught-up
src/routes/Interview.test.tsx, src/routes/Practice.test.tsx  # cover the nudge
README.md                   # export/import paragraph replaces the deferral
```

`src/test/copySweep.test.ts` needs no change: the new route and component
live in directories it already scans.

---

## Ordered tasks

### Task 1 — Archive build and export download
Add `fflate`; implement `buildArchive` and `downloadArchive` in
`src/lib/archive.ts` per the locked format.

**Accept when:**
- `buildArchive` returns a zip whose `dictionary.json` matches the
  manifest schema and whose `audio/` files byte-match the stored blobs,
  covering every row in all six stores (verified in
  `src/lib/archive.test.ts` with `fake-indexeddb`, including more rows
  than the UI list cap).
- The filename is `grandmas-dictionary-<YYYY-MM-DD>.zip` and the blob
  type is `application/zip`.
- Optional fields absent on a row are omitted from the manifest, and the
  manifest round-trips through `JSON.parse` cleanly.

### Task 2 — Parse, validate, merge, import
Implement `parseArchive` and `importArchive` per the locked validation
list and merge semantics.

**Accept when (all in `src/lib/archive.test.ts`):**
- Export → wipe the fake DB → import rebuilds every row, and every audio
  blob is byte-identical to the original.
- Importing the same archive twice adds zero rows and reports
  `skippedExisting` correctly.
- Importing an archive into a DB that has its own distinct entries
  yields the union, keeps local revisit rows for local entries, and
  imports an archive attempt onto an existing local entry.
- Each malformed case throws the right `ArchiveError.kind` and writes
  NOTHING: truncated bytes, not a zip, missing `dictionary.json`, wrong
  `format`, `archiveVersion` 2, missing referenced audio file, dangling
  `audioBlobId`, oversized declared audio, over-cap row counts.
- A simulated transaction failure mid-import leaves prior data intact.

### Task 3 — The data screen
Build `/data` per the design above; register the route; add
`countAttempts` to `db.ts`.

**Accept when:**
- With entries present, `Save a backup` is the single visually primary
  action; tapping it shows feedback within 100ms and triggers a
  download; storage bytes, persisted state, and counts render; the
  not-persisted badge is an actionable `Keep on this device` button.
- With 0 entries, the designed empty state shows with import primary and
  a link to record; export is absent.
- Import success shows real counts; the all-duplicates case shows its
  own line; every failure kind shows its designed error copy and the
  dictionary is unchanged.
- All states hold layout (skeleton while counts load, inline progress
  for export and import); everything is usable at 390px with no
  horizontal scroll, ~44px touch targets, labeled controls, visible
  focus; `Data.test.tsx` covers primary/empty/success/error states.

### Task 4 — The export nudge
Build `ExportNudge` and mount it on the interview summary and the
practice caught-up screen per the design.

**Accept when:**
- After an interview session with ≥1 saved word, the summary shows the
  nudge; its `Save a backup` button starts the download in one tap;
  `Not now` dismisses it for that view. Same on practice caught-up after
  ≥1 attempt this session.
- A session that saved nothing shows no nudge.
- Covered in `Interview.test.tsx` and `Practice.test.tsx` (nudge
  presence, absence, dismiss, and that the export function is invoked on
  tap).

### Task 5 — Home link, README, copy sweep, e2e
Wire the Home link, update the README paragraph, sweep all new copy, and
write `e2e/heirloom.spec.ts`.

**Accept when:**
- Home shows the subordinate `Save a backup` link only when entries
  exist.
- README describes export/import accurately; the "later release"
  sentence is gone; no factory internals.
- `npm test` passes including the copy sweep over every new file; a
  manual check of new strings finds no em-dash, no banned vocabulary,
  no negative phrasing.
- The e2e (at a 390px viewport, production build) passes: record two
  entries and one attempt through the real UI, export via
  `waitForEvent("download")`, open a FRESH browser context, import the
  downloaded file on `/data`, see the entries in the dictionary, play
  one back, and assert via `page.evaluate` over IndexedDB that an elder
  blob and an attempt blob are byte-identical to the first context's;
  then import the same file again in the same context and assert counts
  are unchanged and the already-here message shows.

---

## Test plan (which tests prove which criterion)

| Planner criterion | Proof |
| --- | --- |
| Export produces one downloadable file containing every entry, recording, and attempt with metadata | `archive.test.ts` completeness tests (Task 1); e2e download at 390px (Task 5); manual desktop download via the same `<a download>` path |
| Fresh-profile import rebuilds the dictionary with identical playback; merge neither destroys nor duplicates | `archive.test.ts` round-trip, twice-import, and union merge tests (Task 2); e2e fresh-context round-trip with byte-equality and repeat-import (Task 5) |
| Data screen shows storage estimate and persisted state, export primary | `Data.test.tsx` state tests (Task 3); e2e touches `/data` for import |
| Dismissible post-session nudge, export one tap away | `Interview.test.tsx` / `Practice.test.tsx` nudge tests (Task 4) |
| Malformed or truncated import shows a designed error and never corrupts | `archive.test.ts` malformed matrix and no-write assertions (Task 2); `Data.test.tsx` error-state rendering (Task 3) |
| Export and import copy passes the copy sweep | `copySweep.test.ts` auto-covers the new files; Task 5 manual sweep |

Existing suites must stay green: `npm test`, `npm run test:e2e` (the new
spec joins `capture`, `interview`, `practice`, `persistence`),
`npm run smoke`. The e2e suite runs Chromium; real WebKit verification of
export and import at 390px is EPIC 5's listed criterion, so do not add a
WebKit project here.

---

## Notes for the implementer

- `fflate`'s sync APIs work in Vitest's Node environment, so archive
  unit tests need no browser shims beyond the existing `fake-indexeddb`
  setup. In the app, either sync or callback APIs are fine at these
  sizes; keep audio entries at compression level 0.
- Build the zip in memory; the validation caps above bound memory use.
  Do not add streaming, workers, or chunked export. That is
  gold-plating past the bar.
- Reuse `ErrorState`, `EmptyState`, `LoadingSkeleton`, `formatBytes`,
  `getStorageStatus`, and `requestPersistence`. Do not build parallel
  versions of any of them.
- Do not add telemetry events for export or import.
- All copy shown in this spec is locked and already sweep-clean; if you
  change a string, re-run the sweep rules against it.
