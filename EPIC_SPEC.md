# EPIC 1 SPEC — Shell, local storage, first recording, staging scaffold

## Quality differentiator (this EPIC is held to it)

**Radical simplicity of capture.** A non-technical grandparent and a busy
parent produce a complete, playable, owned talking dictionary in one
kitchen-table sitting, with no account and no setup. This EPIC lays the
capture foundation, so it is judged on this dimension directly.

What it demands of THIS EPIC's work: the record → save → play-back loop must
be reachable with no account, no setup screen, and near-zero friction. From a
cold open a user reaches the record control and captures a first word in a
couple of taps; playback is instant because the audio is local. Every added
tap, field, or wait on this path is a defect against the differentiator, not
just the baseline bar.

---

## Scope

### In scope
- Mobile-first single-page app shell (Vite + React + TypeScript) and client
  routing.
- Local persistence layer on IndexedDB: dictionary metadata, entries, elder
  recordings, and audio blobs, with a versioned forward-only migration
  framework (schema v1).
- Audio capture via `MediaRecorder` + `getUserMedia`, with feature detection,
  a designed microphone-denied state, and a designed unsupported-browser /
  insecure-context fallback.
- Create one entry: record elder audio, type a written form and a meaning,
  save it. See it in the dictionary list. Play it back instantly.
- Request persistent storage (`navigator.storage.persist()`), and show whether
  storage is persisted plus an estimate of space used.
- Runtime env injection for a static client (a generated `config.js`) so the
  container can pass `SEED_DEMO`, analytics, and error-tracking settings to the
  client without a rebuild.
- A `SEED_DEMO` hook: when set, on first open with an empty database the app
  loads a bundled demo dictionary from a manifest. The loader mechanism ships
  in this EPIC; the demo CONTENT (real two-voice entries) is filled in EPIC 3,
  so the bundled manifest is empty here and the loader must handle an empty
  manifest without error.
- Analytics (Umami) and error tracking (GlitchTip/Sentry) wired from runtime
  env, sending no family audio, no entry text, and no PII.
- Container (`Dockerfile`), staging compose (`docker-compose.staging.yml`),
  `GET /healthz`, and `.env.example` with placeholders only.

### Out of scope (Non-goals — binding, do NOT build)
- No interview / guided prompt deck (EPIC 2). Do not build `/interview` or any
  prompt content.
- No record-back, no attempts, no two-voice playback, no practice / spaced
  revisit queue (EPIC 3). Do not create an `attempts` store or `dueAt` fields.
- No export or import, and no `/data` export UI beyond the storage-status
  readout named above (EPIC 4).
- No accounts, login, profiles, cloud sync, or any server that stores family
  data.
- No runtime LLM, no bring-your-own-key surface, no gateway grant.
- No formal guided first-run walkthrough. The plan assigns the skippable
  2–4-step guided path to EPIC 5. This EPIC delivers a clear first-run home and
  empty state that lead a new user to the record control without
  documentation (QUALITY BAR §4 "understand + reach core action"), but must NOT
  build the step-by-step walkthrough. Building it now is drift; its absence
  now is not a defect.

### Security posture note (matches the product plan, so reviewers do not
mis-flag it)
This is a static client with no application API. The only server job is serving
files plus `GET /healthz`. There are no accounts and no data endpoints, so
there is nothing to authorize server-side and no family data in transit. QUALITY
BAR §5 is satisfied by: input validated at the CLIENT boundary (field length
caps, audio MIME allow-list, audio size/duration caps); secrets via env only;
no PII in any analytics or error beacon; static server exposes only the built
assets and `/healthz`. Server-side authorization and rate limiting are N/A
because no mutation route exists. State this posture in the summary rather than
inventing an API to secure.

---

## Technical design

### Stack and layout
- Vite + React + TypeScript SPA. Client routing via `react-router-dom`.
- IndexedDB accessed through the small `idb` wrapper (reduces raw-request
  bugs). Tests use `fake-indexeddb`.
- Unit/component tests: Vitest + React Testing Library (jsdom). E2E: Playwright
  (Chromium with fake media device flags).
- Runtime container: `nginx:alpine` serving the built static bundle, with an
  entrypoint that generates `config.js` from env before nginx starts.

Suggested file structure (implementer may adjust names, not responsibilities):
```
index.html
src/
  main.tsx                # app bootstrap, router, storage-persist + seed on boot
  App.tsx                 # shell layout (mobile-first), route outlet
  routes/
    Home.tsx              # first-run home; primary action -> record a word
    NewEntry.tsx          # record + written form + meaning + save + playback
    Dictionary.tsx        # list of saved entries with play controls
    EntryDetail.tsx       # single entry: metadata + elder audio playback
  lib/
    db.ts                 # idb open, schema v1, migration framework, CRUD
    audio.ts              # getUserMedia + MediaRecorder capture, MIME selection
    capabilities.ts       # feature detection (MediaRecorder, getUserMedia, secure ctx)
    storage.ts            # persist(), persisted(), estimate()
    config.ts             # read window.__APP_CONFIG__ with safe defaults
    seedDemo.ts           # SEED_DEMO hook: load bundled manifest on first open
    telemetry.ts          # Umami + Sentry init from config, PII-free
  components/
    RecordButton.tsx      # one primary action; instant pressed/recording state
    AudioPlayer.tsx       # play a stored blob via object URL, revoke on cleanup
    states/               # EmptyState, ErrorState, LoadingSkeleton
  styles/                 # mobile-first CSS (base, tokens)
public/
  demo/manifest.json      # EMPTY manifest this EPIC: {"schemaVersion":1,"entries":[]}
  demo/audio/             # (empty; EPIC 3 fills audio files)
Dockerfile
docker-compose.staging.yml
nginx.conf
docker-entrypoint.d/40-app-config.sh   # writes config.js from env
.env.example
.dockerignore
```

### Data model (IndexedDB, schema v1)
Follow the product plan's data model. Create ONLY the stores this EPIC needs.
The migration framework must be version-based and additive so later EPICs can
add stores/indexes without rewriting existing data (forward-only).

Object stores (v1), all keyed by string `id`:
- `meta` — key/value store for app flags. Holds `schemaVersion`, and a
  `demoSeeded` boolean flag guarding the seed hook.
- `dictionaries` — `{ id, familyName?, createdAt, schemaVersion }`. A single
  local dictionary is created on first save if none exists.
- `entries` — `{ id, dictionaryId, writtenForm?, meaning, category,
  promptId?, elderRecordingId, createdAt }`. Index: `by-createdAt` for list
  ordering. `category` defaults to `"uncategorized"` in this EPIC (categories
  arrive with the deck in EPIC 2). Do NOT add `dueAt`/revisit fields (EPIC 3).
- `elderRecordings` — `{ id, audioBlobId, durationMs, recordedAt }`.
- `audioBlobs` — `{ id, blob, mimeType, sizeBytes }`.

Migration framework: `db.ts` opens the DB at `DB_VERSION = 1`; the `upgrade`
callback switches on `oldVersion` and creates the v1 stores/indexes. Document
in a comment that later versions add a new `case` and never mutate existing
data in place. Writing an entry that has an elder recording is one logical
operation across `entries`, `elderRecordings`, and `audioBlobs`; perform it in
a single `readwrite` transaction spanning those stores so a partial save cannot
orphan a blob.

### Audio capture (`audio.ts`, `capabilities.ts`)
- Capability check order: secure context (`window.isSecureContext`) →
  `navigator.mediaDevices?.getUserMedia` → `window.MediaRecorder`. Any missing
  → unsupported fallback state (not a crash).
- MIME selection: pick the first supported of
  `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`, `audio/aac` via
  `MediaRecorder.isTypeSupported`; if none report supported, let MediaRecorder
  choose its default and read the actual `mimeType` off the recorder. Store the
  real MIME string on the `audioBlobs` record so playback always matches (Safari
  records `audio/mp4`; Chrome/Firefox `audio/webm`).
- Permission: call `getUserMedia({ audio: true })` only when the user taps
  record. A rejected promise (`NotAllowedError`/`SecurityError`) → designed
  denied state with a clear next step. Stop all tracks
  (`stream.getTracks().forEach(t => t.stop())`) when recording ends.
- Caps (client-boundary validation): stop recording automatically at a max
  duration (e.g. 120s) and reject/trim a blob over a max size (e.g. 25 MB) with
  a designed message. Cap `writtenForm` and `meaning` field lengths (e.g. 200
  and 500 chars) and trim whitespace before save.

### Perceived-speed requirements (QUALITY BAR §1)
- First meaningful render within ~1s: keep the initial bundle lean, render the
  Home shell immediately, load IndexedDB data after paint. Never show a blank
  white page; the shell and its primary action paint first.
- Recording feedback within 100ms: the record control switches to its
  active/pressed visual state and starts a running timer synchronously inside
  the tap handler, BEFORE `getUserMedia` resolves. Show a brief "starting"
  affordance while permission/stream resolves. Stop switches to the
  saved/processing state synchronously on tap. Do not gate the visual feedback
  on recorder events.
- The dictionary list reads through the `by-createdAt` index (no full-store
  scan-and-sort on the hot path) and renders newest first.

### Runtime env injection (static client)
- `docker-entrypoint.d/40-app-config.sh` runs at container start (nginx:alpine
  executes scripts in `/docker-entrypoint.d/`) and writes
  `/usr/share/nginx/html/config.js`:
  ```
  window.__APP_CONFIG__ = {
    SEED_DEMO: "<value or empty>",
    UMAMI_URL: "<value or empty>",
    UMAMI_WEBSITE_ID: "<value or empty>",
    SENTRY_DSN: "<value or empty>"
  };
  ```
  Values come from env; missing vars become empty strings. `index.html` loads
  `config.js` (a plain script, not a module, no cache) before the app bundle.
- `config.ts` reads `window.__APP_CONFIG__` with safe empty-string defaults so
  local `vite dev` (no `config.js`) works. `SEED_DEMO` is truthy when the env
  string is a non-empty, non-"false"/"0" value.

### `SEED_DEMO` hook (`seedDemo.ts`)
- On boot, if `config.SEED_DEMO` is truthy AND `meta.demoSeeded` is not set AND
  the `entries` store is empty: fetch `public/demo/manifest.json`, import each
  listed entry (fetch its audio file to a blob, create the `audioBlobs`,
  `elderRecordings`, and `entries` rows), then set `meta.demoSeeded = true`.
- The manifest schema (used by EPIC 3):
  `{ "schemaVersion": 1, "entries": [ { "writtenForm"?, "meaning", "category",
  "promptId"?, "audio": "demo/audio/<file>", "durationMs" } ] }`.
- This EPIC ships an EMPTY manifest (`"entries": []`). The loader must complete
  cleanly on an empty manifest (seed nothing, still set `demoSeeded`) and must
  never throw on a missing manifest or missing audio file. Seeding runs at most
  once per database (idempotent via `demoSeeded`).

### nginx / healthz
- `nginx.conf`: serve the static bundle with SPA fallback
  (`try_files $uri /index.html`), a `location = /healthz { return 200; }` (or a
  tiny static body) with `access_log off`, and `config.js` served
  `no-store`/no-cache so a redeploy with new env takes effect.

### Telemetry (`telemetry.ts`)
- If `UMAMI_URL` + `UMAMI_WEBSITE_ID` present, inject the Umami script with
  those attributes. If `SENTRY_DSN` present, init the Sentry browser SDK.
- Never include entry text, written forms, meanings, audio, or any family data
  in events or breadcrumbs. Scrub request/URL data that could carry it. No key
  or DSN is hardcoded; all come from `config.js`. When a value is absent, that
  channel stays off and the app runs normally.

### Container files
- `Dockerfile`: multi-stage. Stage 1 `node:*-alpine` runs `npm ci` + `npm run
  build`. Stage 2 `nginx:alpine` copies `dist/` to
  `/usr/share/nginx/html`, copies `nginx.conf` and the entrypoint script into
  `/docker-entrypoint.d/`. No secrets baked in.
- `docker-compose.staging.yml`: builds the image, maps a host port to nginx
  `:80`, passes `SEED_DEMO`, `UMAMI_URL`, `UMAMI_WEBSITE_ID`, `SENTRY_DSN` from
  the environment (`${VAR}` form, defaulting empty), and defines a healthcheck
  hitting `/healthz`. No credentials literal in the file.
- `.env.example`: placeholder lines only, e.g.
  `SEED_DEMO=`, `UMAMI_URL=`, `UMAMI_WEBSITE_ID=`, `SENTRY_DSN=`. No real
  values. `.env` stays untracked (add to `.gitignore` / `.dockerignore`).

---

## Ordered task list (each with acceptance criteria)

**T1 — Project scaffold, shell, routing.**
Vite + React + TS project; mobile-first base styles; `App` shell; router with
Home, NewEntry (`/new`), Dictionary (`/dictionary`), EntryDetail (`/entry/:id`).
- AC: `npm run build` produces a static `dist/`. App boots, Home renders with
  one obvious primary action leading to recording a word. No horizontal scroll
  at 390px on any implemented screen. Only EPIC-1 routes are registered (no
  interview/practice/data screens).

**T2 — Runtime config + capability detection.**
`config.ts` reads `window.__APP_CONFIG__` with safe defaults; `capabilities.ts`
detects secure context, `getUserMedia`, `MediaRecorder`.
- AC: With no `config.js` (dev), the app runs with all channels off. Capability
  results drive whether the record control or the fallback state shows.

**T3 — Persistence layer + migration framework.**
`db.ts`: open at version 1, create v1 stores/indexes, CRUD for dictionaries,
entries, elder recordings, audio blobs, and `meta` flags. Single transaction for
the compound entry+recording+blob save.
- AC: Creating and reading an entry with audio round-trips through IndexedDB.
  A comment documents how a future version adds a store additively. Unit tests
  pass against `fake-indexeddb`.

**T4 — Persistent storage request + status.**
`storage.ts`: call `navigator.storage.persist()` on first boot; expose
`persisted()` and `estimate()`. Show status (persisted yes/no and space used)
in the storage-status surface.
- AC: The UI shows whether storage is persisted and an estimate of space used.
  On browsers without the Storage API, the surface degrades to a plain
  "not available" readout, not a crash.

**T5 — Audio capture module + designed failure states.**
`audio.ts` capture with MIME selection and track cleanup; denied-permission
state; unsupported/insecure-context fallback state.
- AC: Denying the mic permission shows a designed error state naming a clear
  next step (positive phrasing, no raw error). A browser without MediaRecorder
  or a non-secure context shows the designed fallback with a next step. Neither
  crashes.

**T6 — Create-entry flow + instant playback.**
`NewEntry` screen: record (one primary action), optional re-record, written
form + meaning fields, save. Immediately play back the just-recorded audio.
- AC: At 390px, a user records audio, enters written form and meaning, saves,
  and can play the audio back. Record start/stop give visible feedback within
  100ms (pressed state + timer synchronous with the tap). Field length caps and
  audio size/duration caps enforced with designed messages.

**T7 — Dictionary list + entry playback.**
`Dictionary` lists saved entries newest-first via the index with a play control
each; `EntryDetail` shows metadata and plays the elder audio. Designed empty
state when there are no entries yet ("Record your first word" style, positive).
- AC: A saved entry appears in the list and plays back. Empty dictionary shows
  a designed empty state that leads to the record action, never a blank region.

**T8 — SEED_DEMO hook.**
`seedDemo.ts` + empty `public/demo/manifest.json`; wired on boot per design.
- AC: With `SEED_DEMO` unset, nothing seeds. With `SEED_DEMO` set and an empty
  DB, the loader runs, handles the empty manifest cleanly, sets `demoSeeded`,
  and never re-seeds on later opens. A missing manifest or audio file does not
  crash the app.

**T9 — Container, compose, healthz, config injection, .env.example.**
`Dockerfile`, `nginx.conf`, `docker-entrypoint.d/40-app-config.sh`,
`docker-compose.staging.yml`, `.env.example`, `.dockerignore`, `.gitignore`.
- AC: `docker compose -f docker-compose.staging.yml up` serves the app; `GET
  /healthz` returns 200; the app first-paints real content within ~1s; env vars
  reach the client via generated `config.js`; no secrets in any tracked file;
  `.env.example` holds placeholders only.

**T10 — Telemetry wiring, PII-free.**
`telemetry.ts` inits Umami and Sentry only when their config is present.
- AC: With DSN/analytics config absent, the app runs unchanged and sends
  nothing. With them present, no entry text, audio, or PII appears in any
  beacon (verified by inspecting the payload/config in a test or a documented
  manual check).

**T11 — States, accessibility, copy sweep, persistence verification.**
Loading skeletons that hold layout; error states; keyboard reach + visible
focus on record/save/play; labeled inputs; sufficient contrast. Full copy sweep.
- AC: No white-screen loads (skeletons/placeholders hold layout). Keyboard
  reaches record, save, and play with visible focus; the record control is
  ~44px. Every user-visible string passes the sweep: no `—`/`–`, no banned
  vocabulary, no negative empty-state phrasing. Entries and audio survive a full
  reload and a browser restart.

---

## Test plan (which automated test proves each criterion)

Unit / component (Vitest + RTL, `fake-indexeddb`):
- `db.ts`: entry+recording+blob save/read round-trip; compound transaction
  atomicity; migration opens at v1 and creates stores → proves T3 and the
  persistence half of the "entries persist" criterion.
- `audio.ts`: MIME selection picks a supported type and records the actual MIME
  on the blob; field/size/duration caps reject over-limit input → proves the
  client-boundary validation part of T6.
- `capabilities.ts` + failure-state components: rendering with
  no-MediaRecorder, no-getUserMedia, insecure-context, and a rejected
  permission each shows the designed state with a next step → proves T5 and the
  "denied/unsupported → designed state, not a crash" criterion.
- `seedDemo.ts`: no seed when `SEED_DEMO` unset; seeds once then no-ops on empty
  manifest; sets `demoSeeded`; tolerates missing manifest → proves T8 and the
  `SEED_DEMO` acceptance criterion.
- `config.ts` / `telemetry.ts`: absent config → channels off, app runs;
  present config → beacons contain no entry text/audio/PII → proves T2 and T10.
- `storage.ts`: persisted/estimate surfaced; Storage-API-absent degrades to a
  readout → proves T4 and the "shows whether storage is persisted" criterion.

E2E (Playwright, Chromium with `--use-fake-device-for-media-stream`
`--use-fake-ui-for-media-stream`), viewport 390px:
- Record → enter written form + meaning → save → see it listed → play it back,
  asserting no horizontal scroll at 390px → proves the main T6/T7 criterion.
- Reload after saving, then reopen using a persistent context (same
  `userDataDir`) to emulate a browser restart, and assert the entry and its
  audio are still present and playable → proves the reload + browser-restart
  persistence criterion.
- Assert first meaningful content (Home primary action) is visible quickly and
  the page is never a blank white screen; assert the record button enters its
  active state on click without waiting on media events → supports the
  perceived-speed criteria (record/stop feedback also covered by a component
  test on the synchronous state switch).

Container smoke (script or CI step, run in foreground to completion):
- Build and `docker compose -f docker-compose.staging.yml up -d`, poll `GET
  /healthz` for 200, load `/` and confirm real content renders, then bring the
  stack down → proves the Dockerfile/compose/healthz criterion. Provide it as an
  `npm run smoke` (or documented commands) so the criterion is reproducible.

Copy sweep (part of DONE, may be a lint/test):
- Grep every user-visible string (components, states, `.env.example` comments,
  demo manifest copy) for `—`, `–`, the banned vocabulary, and negative
  empty-state phrasing (`You don't have`, `No … yet`, `Nothing … here`,
  `Unable to`, `Something went wrong`); zero hits → proves the copy criteria in
  T7 and T11.
