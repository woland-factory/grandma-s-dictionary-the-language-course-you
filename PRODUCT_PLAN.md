# PRODUCT PLAN — Grandma's Dictionary: the language course your family records

## Core value (one sentence)

A family turns an aging relative into a talking dictionary in one sitting,
then a child practices by hearing each word and saying it back, and both
voices live side by side in one file the family owns.

## North star

Years from now a grandchild opens the family's file and hears their
great-grandmother, gone by then, say a word in the family's language.
Then they hear their own small voice from years ago answering it back,
and they add today's attempt beside both. The file has quietly become the
family's most precious possession: a real course only this family could
ever have, made in an afternoon at a kitchen table, and impossible to
lose. Nobody needed an account, a subscription, or a technical relative.
The words, the sounds, and the voices survived, and a child grew up with a
living link to them.

## Quality differentiator (the one dimension we win on)

**Radical simplicity of capture.** A non-technical grandparent and a busy
parent produce a complete, playable, owned talking dictionary in one
kitchen-table sitting, with no account and no setup. This is where we beat
every named alternative: Living Dictionaries is manager-run and
account-based, Anki-with-audio is hostile to non-technical elders, Dialect
cannot record your family at all. We commit to this one dimension. Speed,
delight, and durability serve it; they are not separate promises.

The **signature moment** (a mechanic, not an adjective) is the two-voice
entry: play the elder saying the word, then the child saying it back, two
voices decades apart in one file.

## User stories (MVP only)

- As a parent at grandma's table, I open a link and start recording her
  answers to guided prompts in two taps, without making an account.
- As the elder, I just answer questions out loud and hear my recording
  play back so I know it worked.
- As a parent, I finish one sitting with a browsable dictionary of the
  words, names, and sayings in her voice.
- As a child, I tap a word, hear grandma say it, and record myself saying
  it back.
- As a child or parent, I replay an entry and hear both voices, grandma
  then me, one after the other.
- As a parent, I come back later and the app shows me which words are due
  for another try.
- As the family, I export the whole dictionary as one file, back it up,
  and open it on another device to keep going.
- As a returning family, I import our file on a new phone and every word
  and attempt plays back exactly as before.

## Data model (sketch)

All state is local to the browser. No server holds family data.

- **Dictionary** (one per device/file): `id`, `familyName?`, `createdAt`,
  `schemaVersion`.
- **Entry**: `id`, `writtenForm?`, `meaning`, `category`, `promptId?`,
  `elderRecordingId`, `createdAt`, and revisit fields `dueAt`,
  `intervalIndex`, `lastReviewedAt?`.
- **ElderRecording**: `id`, `audioBlobId`, `durationMs`, `recordedAt`.
- **Attempt** (child record-back): `id`, `entryId`, `audioBlobId`,
  `createdAt`. Attempts are append-only; a new attempt never overwrites an
  earlier one or the elder original.
- **AudioBlob**: `id`, `blob`, `mimeType`, `sizeBytes`.
- **Prompt deck**: static bundled JSON (categories and prompts). Not
  stored in the database; shipped with the app.

## Screens and endpoints inventory

This is a single-page client app. There is **no application API**: the only
server job is serving static files. All family data stays on the device.

Client routes:
- `/` — Home and first run: what the app is, one primary action to start
  the interview, and a way to continue an existing dictionary.
- `/interview` — Guided interview: one prompt at a time with record,
  re-record, skip, next, and progress.
- `/dictionary` — The talking dictionary: browse entries, play elder audio.
- `/entry/:id` — Entry detail: two-voice playback, record-back, attempt
  history.
- `/practice` — Spaced-revisit queue: words due for another try.
- `/data` — Export, import, and storage status.

Server endpoints:
- `GET /healthz` — container health check.
- Static asset serving only. Analytics (Umami) and error tracking
  (GlitchTip/Sentry) are wired via env at deploy time and carry no family
  audio and no PII.

## Deploy and runtime notes

- The app ships as a container that serves the built static bundle, with a
  `Dockerfile` and `docker-compose.staging.yml` at the repo root (EPIC 1).
- `SEED_DEMO`: when set on staging, the app loads a bundled demo dictionary
  on first open so a stranger sees the two-voice moment within a minute
  without hand-crafted input.
- **No runtime LLM in the core loop.** The interview is a curated static
  prompt deck. First value never waits on an API key. No gateway grant is
  requested. An optional bring-your-own-key helper (suggesting follow-up
  prompts) is explicitly out of scope for the MVP.
- **Security posture:** there are no accounts and no data endpoints, so
  there is nothing to authorize server-side and no family PII in transit.
  Input is validated at the client boundary (field sizes, audio type and
  size caps). Secrets (analytics ID, error DSN) arrive via env only. This
  posture is a deliberate design choice, not an omission.

## EPICs (build order)

### EPIC 1 — Shell, local storage, first recording, staging scaffold
**Scope.** Mobile-first app shell and routing. Local persistence layer
(IndexedDB for entry metadata and audio blobs). MediaRecorder capture with
permission handling and an unsupported-browser fallback. Create one entry
(record elder audio, type written form and meaning), save it, see it in a
list, and play it back instantly. Request persistent storage. Container and
staging deploy scaffold.

**Acceptance criteria.**
- `Dockerfile` and `docker-compose.staging.yml` exist at the repo root;
  `docker compose -f docker-compose.staging.yml up` serves the app and
  `GET /healthz` returns 200.
- The compose file honors the `SEED_DEMO` convention: a hook exists so
  that when `SEED_DEMO` is set, the app loads a bundled demo dictionary on
  first open (demo content is filled in EPIC 3).
- At a 390px viewport with no horizontal scroll, a user can record audio,
  enter a written form and meaning, save the entry, see it listed, and play
  the audio back.
- Denied microphone permission and browsers without MediaRecorder show a
  designed error state with a clear next step, not a crash or raw error.
- Entries and audio persist across a full reload and a browser restart; the
  app calls `navigator.storage.persist()` and shows whether storage is
  persisted.
- First meaningful render appears within about 1 second; starting and
  stopping a recording gives visible feedback within 100ms.
- No secrets in tracked files; `.env.example` holds placeholders only;
  analytics and error DSN are read from env with no PII in any beacon.

**Non-goals.** No interview deck yet, no practice loop, no export, no
account or cloud sync.

### EPIC 2 — The guided interview
**Scope.** A bundled static prompt deck across categories (foods,
endearments, blessings, things you say to children, words your family
invented, kinship terms). A one-prompt-at-a-time flow with one-tap record,
re-record, skip, and next, plus a progress indicator. Each answer becomes a
dictionary entry tagged with its prompt and category. Recording starts with
no account and no setup screen first.

**Acceptance criteria.**
- From the home screen a new user reaches the first prompt and records an
  answer in at most two taps, with no account creation or setup form first.
- The deck ships at least 30 prompts across at least 5 categories, all in
  the bundle with no network needed.
- Each recorded answer saves as an entry tagged with its category and
  appears in the dictionary; written form and meaning can be added during
  or after recording.
- A user can complete a full pass and land on a session summary showing how
  many entries were captured; the flow adds no per-entry friction beyond
  record plus optional typing, so one sitting can plausibly yield 20 or
  more entries.
- Record, skip, and next controls are keyboard reachable with visible
  focus; the record control is about 44px.
- All prompt text and category labels pass the copy sweep: no em-dashes, no
  banned vocabulary, positive phrasing.

**Non-goals.** No LLM-generated prompts, no editing the deck, no branching
questionnaires.

### EPIC 3 — Record-back practice and the two-voice moment
**Scope.** Entry detail with sequential two-voice playback (elder, then
latest attempt). A child records an attempt stored as a new dated attempt
beside the elder recording, never overwriting. Attempt history. A
spaced-revisit queue that surfaces due entries on a practice screen using
fixed expanding intervals. Seed the `SEED_DEMO` demo dictionary with real
two-voice entries.

**Acceptance criteria.**
- On an entry, play plays the elder recording then the most recent attempt
  in sequence. With no attempt yet, only the elder plays and the record-back
  control invites the first attempt.
- Recording a record-back attempt stores it with a date and preserves all
  prior attempts and the elder original; attempt history is viewable and
  each attempt is individually playable.
- The practice screen surfaces entries due by the revisit schedule;
  completing a record-back advances that entry to the next expanding
  interval; an empty due queue shows a designed empty state.
- With `SEED_DEMO` set, the app loads a bundled demo dictionary of at least
  5 entries, at least 3 with both an elder recording and a child attempt,
  so the two-voice moment is playable within a minute of opening the
  deployed app with no hand-crafted input.
- Two-voice playback and record-back are fully usable at 390px and give
  feedback within 100ms.

**Non-goals.** No automatic pronunciation scoring, no speech recognition,
no audio trimming or effects, no engagement streaks or notifications.

### EPIC 4 — The heirloom file (export and import)
**Scope.** Export the whole dictionary (all audio, all metadata, all
attempts) as one downloadable archive file. Import an archive on any device
to restore or merge. A storage and quota status surface. An export nudge at
the end of each recording or practice session.

**Acceptance criteria.**
- Export produces one file that downloads on mobile and desktop and
  contains every entry, elder recording, and attempt with metadata.
- Importing that file on a fresh browser profile rebuilds the dictionary so
  every entry and attempt plays back identically (round-trip verified).
  Importing into a non-empty dictionary merges without destroying existing
  entries and without duplicating identical ones.
- The data screen shows an estimate of storage used and whether storage is
  persisted, and offers export as its primary action.
- After an interview or practice session the user sees a dismissible nudge
  to export, with export reachable in one tap.
- A malformed or truncated import file shows a designed error state and
  never corrupts the existing dictionary.
- Export and import copy passes the copy sweep.

**Non-goals.** No cloud storage, no sharing links, no multi-family merge
tooling, no server-side backup.

### EPIC 5 — Polish pass (POLISH)
**Scope.** A UX, performance, accessibility, and copy pass over the whole
product against the QUALITY BAR and the quality differentiator. Add the
skippable guided first-run path anchored to real controls. Verify designed
empty, loading, and error states everywhere. Verify recording and playback
on a real mobile WebKit/Safari-class viewport. Write the stranger-facing
README. No new features; tighten what exists.

**Acceptance criteria.**
- A skippable guided first run of 2 to 4 steps, one short imperative
  sentence each, walks a brand-new user from opening the app to recording
  one entry and hearing the two-voice moment once. It is skippable at every
  step and never appears again after the first success.
- Every screen has designed empty, loading, and error states (verified as a
  list): no blank regions, no white-screen loads (skeletons or placeholders
  hold the layout), no raw errors or stack traces.
- Each screen has one obvious primary action with secondary actions visibly
  subordinate; a full sweep of every user-visible string finds zero
  em-dashes, zero banned vocabulary, and zero negative empty-state phrasing.
- The differentiator is demonstrable on staging: opening the `SEED_DEMO`
  deployment leads a new user to a playable two-voice entry within one
  minute without hand-crafted input.
- Recording, playback, export, and import are verified working at 390px on
  a WebKit/Safari-class engine with its audio format handled; keyboard
  reaches every interactive control with visible focus; color contrast
  meets WCAG AA.
- First meaningful render within about 1 second; the dictionary list stays
  responsive and is capped or virtualized so it does not slow down with
  hundreds of entries.
- The README lets a stranger understand the app, run it (commands verified
  against the actual compose files), and contribute, with no factory
  internals.

**Non-goals.** No new features, no redesign, no added configurability.

## Non-Goals / Out of scope (product-wide fence)

- **Accounts, login, or user profiles.** No-account is the differentiator.
- **Cloud sync or any server storing family audio.** The file is the
  sync story.
- **Multi-family, sharing, collaboration, or social surfaces.** One family
  is a complete unit of value.
- **Runtime LLM in the core loop**, and any owner-gateway grant. An
  optional bring-your-own-key follow-up-prompt helper is a future idea, not
  MVP.
- **Grammar, conversation, sentences, translation, or any fluency claim.**
  This is a lexicon and a voice, and it must never claim to teach fluency.
- **Automatic speech recognition or pronunciation scoring.** The human ear
  judges; the app only holds the voices side by side.
- **Audio editing** (trimming, denoise, effects) and long-form oral
  history. Hundreds of short entries, not hours of continuous audio.
- **Native mobile apps.** Web only.
- **Engagement mechanics**: streaks, push notifications, leaderboards. The
  heirloom value must not depend on retention.
- **The child-as-interviewer variant** ("Littlest Field Linguist"). It
  flavors the prompt deck's voice at most; the architecture stays
  capture-first.
