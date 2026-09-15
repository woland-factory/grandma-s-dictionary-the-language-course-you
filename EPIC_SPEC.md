# EPIC 3 SPEC — Record-back practice and the two-voice moment

## Quality differentiator (this EPIC is held to it)

**Radical simplicity of capture.** A non-technical grandparent and a busy
parent produce a complete, playable, owned talking dictionary in one
kitchen-table sitting, with no account and no setup. This EPIC ships the
signature payoff of that capture: the child hears grandma and answers back.

What it demands of THIS EPIC's work: the child's record-back must cost one
tap, with no fields required and no setup, exactly like the elder capture in
EPIC 2. The two-voice moment must be reachable and playable with one tap.
Play means "hear both voices" without the user choosing tracks, wiring
playlists, or reading instructions. On the deployed app with `SEED_DEMO` set,
a stranger must hear the two-voice moment within a minute of opening it, with
no hand-crafted input. Any extra tap, required field, or wait on the
record-back or two-voice-play path is a defect against the differentiator,
not just the baseline bar.

**The signature moment this EPIC ships (Ambition Bar).** One tap on an entry
plays the elder saying the word, then the child saying it back, two voices
kept side by side in one file the family owns. This is the interaction a user
describes to a friend. It must actually ship and be reachable in the first
minute, not live only in the README.

---

## Scope

### In scope
- **Entry detail becomes the two-voice surface** (`src/routes/EntryDetail.tsx`):
  a single prominent **Play** that plays the elder recording, then the most
  recent child attempt, in sequence. With no attempt yet, Play plays only the
  elder, and a **record-back** control invites the first attempt.
- **Record-back capture**: a one-tap record control on the entry that stores
  the child's attempt as a NEW dated attempt beside the elder recording,
  never overwriting the elder original and never overwriting prior attempts.
- **Attempt history**: every attempt for an entry is viewable with its date,
  newest first, and each attempt is individually playable. The elder original
  is always shown and playable on its own too.
- **Data model**: a new `attempts` store and a new `revisit` store, added by a
  forward-only IndexedDB migration (`DB_VERSION` 1 → 2). No existing row is
  rewritten in place.
- **Spaced-revisit schedule**: fixed, expanding, deterministic intervals. A
  new entry is due immediately. Completing a record-back advances that entry
  to the next interval.
- **Practice screen** (`/practice`): surfaces entries due by the revisit
  schedule, one at a time (play the elder, record back, advance to the next
  due entry). A designed empty state when nothing is due.
- **Practice entry point** on Home (subordinate to the existing primary
  action).
- **Seed the demo dictionary**: bundle a real, coherent demo dictionary under
  `public/demo/` with at least 5 entries, at least 3 carrying both an elder
  recording and a child attempt, so the two-voice moment plays within a
  minute of opening the deployed app with `SEED_DEMO` set. Extend the demo
  manifest and loader to carry a child attempt per entry.

### Out of scope (Non-goals — binding, do NOT build)
- **No automatic pronunciation scoring.** Never compare, grade, or score the
  child attempt against the elder recording. No "you got it right" signal.
- **No speech recognition / transcription** of any recording.
- **No audio trimming, cropping, waveform editing, or effects.** Attempts are
  stored exactly as recorded, like the elder capture in EPIC 1.
- **No streaks, badges, daily goals, or push / email notifications.** The
  practice screen shows what is due when the user opens it; it never nags,
  counts consecutive days, or sends mail. Do not wire the central mailer.
- **No adjustable or user-configurable schedule.** The intervals are fixed
  constants in code. No settings surface, no per-entry override.
- **No LLM, no bring-your-own-key surface, no gateway grant.** Nothing in this
  EPIC calls a model.
- **No deleting or editing attempts or the elder original.** Attempts only
  accumulate. (Deletion is not required by any criterion; leave it out.)
- **No export / import or `/data` screen** (EPIC 4).
- **No formal guided first-run walkthrough overlay** (EPIC 5). Do not build
  the skippable 2–4 step highlighted path here. Designed empty/first states on
  the practice and entry screens are in scope; the walkthrough overlay is not.
- **No account, sync, or server route.** The app stays a static client.

### Security / data posture (unchanged; restate so reviewers do not mis-flag)
This remains a static client with no application API. Record-back, attempts,
the revisit schedule, and the demo seed add no server route and no network
call beyond fetching the bundled demo assets from the app's own origin. All
audio and attempt data stay in IndexedDB on the device. QUALITY BAR §5 is met
as in EPIC 1: input is validated at the CLIENT boundary (the existing audio
duration and size caps in `audio.ts` apply unchanged to attempts), no secrets
in code, no PII in any analytics or error beacon. Server-side authorization
and rate limiting stay N/A because no mutation route exists. Telemetry
(`telemetry.ts`) must continue to carry no entry text, audio, ids, or dates.

---

## Technical design

The capture engine (recorder, `RecordButton`, `AudioPlayer`,
`detectCapabilities`, `useRecorder`) already exists from EPIC 1. This EPIC
adds two IndexedDB stores, a handful of DB functions, sequential playback on
the entry, one new route, and the demo seed. **Reuse the existing recorder and
players. Do not build a second recorder or a second audio player.**

### Files to add
```
src/routes/Practice.tsx          # the due-queue practice loop
src/lib/revisit.ts               # pure schedule math: intervals + nextRevisit()
src/lib/revisit.test.ts          # schedule math unit tests
src/routes/Practice.test.tsx     # component tests for the practice loop
src/routes/EntryDetail.test.tsx  # component tests for two-voice + record-back
e2e/practice.spec.ts             # 390px e2e: record-back, two-voice play, practice
```
Optional small splits at the implementer's discretion, same responsibilities:
a `TwoVoicePlayer` component under `src/components/` for the sequential
elder→attempt playback, and/or an `AttemptList` component. Do not add a
component library or an abstraction layer for these screens.

### Files to change
```
src/lib/db.ts            # DB_VERSION 1->2; attempts + revisit stores; new APIs
src/lib/db.test.ts       # migration, attempts, revisit, due-queue tests
src/routes/EntryDetail.tsx  # two-voice Play, record-back, attempt history
src/routes/Home.tsx      # subordinate Practice entry point
src/App.tsx              # register the /practice route
src/lib/seedDemo.ts      # load a child attempt per demo entry
src/lib/seedDemo.test.ts # attempt-in-manifest seeding test
public/demo/manifest.json  # real demo entries with elder + attempt audio
public/demo/audio/*      # real, audible demo audio files (elder + child)
src/styles/index.css     # styles for two-voice player, attempt list, practice
```
`src/routes/NewEntry.tsx`, `/new`, `src/routes/Interview.tsx`, `/interview`,
`src/routes/Dictionary.tsx`, and the deck stay working exactly as they are.
Do not rewrite or delete them.

### Data model (forward-only migration, `DB_VERSION` 1 → 2)

Add two stores in a NEW `case 1:` of the existing upgrade switch in
`src/lib/db.ts`. The fall-through means a fresh DB (oldVersion 0) runs
`case 0` then `case 1`; an existing v1 DB runs only `case 1`. **Never delete
or rewrite `entries`, `elderRecordings`, `audioBlobs`, `dictionaries`, or
`meta`.** The migration may READ `entries` and WRITE the new `revisit` store
(additive backfill); it must not mutate any `entries` row.

New types:
```ts
export interface Attempt {
  id: string;
  entryId: string;
  audioBlobId: string;   // points into the existing audioBlobs store
  durationMs: number;
  recordedAt: number;    // ms epoch; the attempt's date
}

export interface Revisit {
  entryId: string;       // keyPath; one row per entry
  intervalIndex: number; // 0 = new / never practiced
  dueAt: number;         // ms epoch; entry is due when dueAt <= now
}
```

Store creation in `case 1:`:
- `attempts`: keyPath `id`, index `by-entry` on `entryId` (so attempts for an
  entry are read without scanning the whole store).
- `revisit`: keyPath `entryId`, index `by-dueAt` on `dueAt` (so the practice
  queue is an indexed range query, never a full scan — QUALITY BAR §1).
- Backfill inside the upgrade transaction: for every existing `entries` row,
  put a `revisit` row `{ entryId, intervalIndex: 0, dueAt: entry.createdAt }`
  so pre-EPIC-3 entries are due immediately and appear in practice. Use the
  `transaction` the idb `upgrade` callback provides; do not open a second
  transaction.

Bump `DB_VERSION` to `2`. `SCHEMA_VERSION` (written on the `dictionaries`
row) is unchanged; leave it at 1.

### Revisit schedule (`src/lib/revisit.ts`) — pure, deterministic

```ts
const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed, expanding intervals in days. No randomness (banned for determinism).
export const INTERVAL_DAYS = [1, 3, 7, 14, 30];

// Given the entry's current intervalIndex and the moment a record-back was
// completed, return the next {intervalIndex, dueAt}. The step size is capped
// at the last interval, so an entry keeps recurring at the widest spacing.
export function nextRevisit(intervalIndex: number, now: number): Revisit-ish {
  const step = INTERVAL_DAYS[Math.min(intervalIndex, INTERVAL_DAYS.length - 1)];
  return { intervalIndex: intervalIndex + 1, dueAt: now + step * DAY_MS };
}
```
Rules:
- A brand-new entry starts at `intervalIndex: 0`, `dueAt: createdAt` (due now).
- Completing a record-back while at index `i` sets index `i+1` and
  `dueAt = completedAt + INTERVAL_DAYS[min(i, last)] * DAY_MS`: first
  completion → +1 day, then +3, +7, +14, then +30 and staying at +30.
- This is the ONLY place interval math lives. `db.ts` calls it.

### New/changed DB APIs (`src/lib/db.ts`)

- `saveEntryWithRecording(...)`: unchanged inputs and return, but its
  transaction now ALSO includes the `revisit` store and writes a revisit row
  `{ entryId, intervalIndex: 0, dueAt: now }` atomically with the entry. So
  every entry created from now on is immediately due. Do not change its
  existing callers (`NewEntry`, `Interview`, `seedDemo`).
- `saveAttempt(entryId, audio: {blob, mimeType, durationMs}): Promise<Attempt>`
  — ONE readwrite transaction over `audioBlobs`, `attempts`, and `revisit`:
  writes the audio blob, writes the attempt with `recordedAt: now`, and
  advances the entry's revisit row via `nextRevisit(current.intervalIndex,
  now)`. If no revisit row exists (defensive), treat current index as 0. This
  single path advances the schedule no matter which screen recorded the
  attempt, so entry-detail and practice stay consistent. Returns the attempt.
- `listAttempts(entryId, limit = 200): Promise<Attempt[]>` — newest first via
  the `by-entry` index, capped so the list cannot grow without bound.
- `getLatestAttempt(entryId): Promise<Attempt | undefined>`.
- `getAttemptAudio(attempt): Promise<AudioBlobRow | undefined>` — resolve the
  blob via `attempt.audioBlobId`.
- `listDueEntries(now = Date.now(), limit = 100): Promise<Entry[]>` — query
  the `revisit` `by-dueAt` index with `IDBKeyRange.upperBound(now)` ascending
  (most overdue first), then load each entry, capped by `limit`. Skip revisit
  rows whose entry is missing. No full-store scan.
- `countDueEntries(now = Date.now()): Promise<number>` — count via the same
  index range (for the Home practice affordance). Cap what you report.

All new mutations write blob + row(s) in a single transaction so a failure
cannot orphan a blob or leave an attempt without its schedule advance, exactly
like `saveEntryWithRecording` does today.

### Entry detail (`src/routes/EntryDetail.tsx`)

Load: the entry, the elder recording + its blob (as today), the latest attempt
+ its blob, and the full attempt list. Keep the existing `loading` /
`missing` designed states.

Layout (mobile-first, 390px):
- Title (written form or meaning) and meaning, as today.
- **Two-voice Play** (the signature moment): one prominent primary button.
  On tap it plays the elder blob; when the elder ends it plays the latest
  attempt blob; a small indicator shows which voice is playing ("In their
  voice" → "Saying it back"). Pressed/active feedback appears synchronously on
  tap, before any audio starts, so feedback is within 100ms. With no attempt,
  Play plays only the elder and the label reflects that.
  - Implement sequential playback by chaining on the first audio's `ended`
    event, reusing object-URL creation/cleanup like `AudioPlayer` /
    `LazyEntryPlayer` (create URLs on play, revoke on cleanup; never leak).
    A `TwoVoicePlayer` component is the clean home for this.
- **Record-back**: reuse `useRecorder` + `RecordButton` and the exact
  recorder-error / unsupported designed states from `NewEntry.tsx` (lift the
  patterns; do not invent new copy). One tap starts capture with the existing
  within-100ms feedback. On stop, call `saveAttempt(entry.id, audio)`, then
  refresh the latest attempt and the attempt list. No required fields; no
  meaning/written-form form on the record-back path. With no attempt yet, the
  control invites the first attempt with a short, warm, positive label (for
  example, "Say it back").
- **Attempt history**: a section listing the elder original first (labeled as
  the elder's voice, individually playable) and then each attempt newest
  first, each showing its date (`recordedAt` via `toLocaleDateString`) and its
  own play control (reuse `AudioPlayer`, which takes a blob + label). Loading
  each attempt blob lazily (like `LazyEntryPlayer`) is preferred so the entry
  does not read every attempt blob up front.
- Keep a link back to the dictionary and a subordinate way to record another
  word (existing pattern).

Elder-original safety: the elder recording and prior attempts are never
mutated or deleted by any path on this screen. A new attempt only appends.

### Practice screen (`src/routes/Practice.tsx`) + route

One-at-a-time practice loop over the due queue:
- On mount, load `listDueEntries()`. Show a loading skeleton while reading.
- **Due state**: show the current due entry (title + meaning), a way to hear
  the elder ("Play in their voice", reuse the player), and a one-tap
  **record-back** (reuse `useRecorder` / `RecordButton` and the same
  recorder-error/unsupported states). Show quiet progress text a screen reader
  can read (for example, "1 of 4 to practice") — this is a plain count of the
  queue, NOT a streak. Completing the record-back calls `saveAttempt` (which
  advances the entry's schedule so it leaves the due window) and moves to the
  next due entry. A subordinate "Skip for now" moves to the next due entry
  without recording and without advancing its schedule.
- **Empty due state** (queue empty on load, or after the last due entry):
  a designed empty state in the product's voice with positive phrasing (for
  example, title "You're all caught up", body inviting them to add more words
  or come back later), a primary action into the dictionary or home, and a
  secondary action to record more (`/interview`). Never a blank region, never
  banned negative empty-state phrasing.
- Register `<Route path="/practice" element={<Practice />} />` in `App.tsx`,
  leaving all existing routes in place.

### Home (`src/routes/Home.tsx`)
- Keep **Start recording** → `/interview` as the single obvious primary
  action, and keep the "Open the dictionary (n)" secondary link and
  `StorageStatusBar`.
- Add a subordinate **Practice** link to `/practice`, shown when there is at
  least one entry to practice (guard on `countEntries()` or `countDueEntries`
  loaded after paint, like the existing count). Style it as a clearly
  subordinate action (`btn--secondary`/`btn--ghost`), never competing with the
  primary. Do not add a third primary. If you surface a due count, keep the
  label short and positive.

### Demo seed (`public/demo/*`, `src/lib/seedDemo.ts`)

Ship a real, coherent demo dictionary so the deployed app demonstrates the
two-voice moment with no hand-crafted input.

Manifest change (`public/demo/manifest.json`) — additive; the loader tolerates
entries without `attempt`:
```jsonc
{
  "schemaVersion": 1,
  "entries": [
    {
      "writtenForm": "yiayia",
      "meaning": "grandmother",
      "category": "kinship",
      "audio": "demo/audio/yiayia-elder.webm",
      "durationMs": 1100,
      "attempt": { "audio": "demo/audio/yiayia-child.webm", "durationMs": 900 }
    }
    // ... see the authored content below
  ]
}
```
Loader change (`src/lib/seedDemo.ts`): after `saveEntryWithRecording` returns
the saved entry, if `item.attempt` is present, fetch its audio and call
`saveAttempt(entry.id, { blob, mimeType, durationMs })`. Keep the existing
per-entry try/catch so one bad asset skips only that piece; keep the
"seed once, mark `demoSeeded`, swallow failures" contract unchanged.

**Demo audio assets** (the load-bearing part of the SEED_DEMO criterion):
- Commit real, audible audio files under `public/demo/audio/` (Vite copies
  `public/` into `dist/`, and the Dockerfile serves `dist/`, so committed
  files ship to staging). Each clip must actually play a spoken word. The
  elder and child clips for an entry must be audibly distinct voices (for
  example, generate them with a text-to-speech tool available in the build
  environment using a lower/slower voice for the elder and a higher voice for
  the child, or use hand-recorded clips). A silent or empty clip does NOT
  satisfy the criterion: the two-voice moment must be genuinely audible.
- Keep each clip small (roughly under a few hundred KB) and in a
  browser-playable format that matches the recorder's output family
  (`audio/webm;codecs=opus` preferred, `audio/mp4`/`aac` acceptable). Set each
  entry's `mimeType` from the fetched blob's type, as the loader already does.
- The `.gitkeep` in `public/demo/audio/` may be removed once real files exist.

**Authored demo content (ship verbatim; pre-swept for the copy rules).** One
coherent family (Greek), so it reads like one family's dictionary. At least 5
entries; at least 3 with both an elder recording and a child attempt (this set
has 4). Category values are valid deck ids so the dictionary tag renders.

| # | writtenForm | meaning | category | attempt? |
|---|-------------|---------|----------|----------|
| 1 | yiayia | grandmother | kinship | yes |
| 2 | pappou | grandfather | kinship | yes |
| 3 | agapi mou | my love | endearments | yes |
| 4 | stin ygeia sou | to your health | blessings | yes |
| 5 | psomi | bread | foods | no |
| 6 | kalinychta | good night | for-children | no |

Copy note: none of `grandmother`, `grandfather`, `my love`, `to your health`,
`bread`, `good night` (nor the transliterated written forms) uses "—"/"–",
banned vocabulary, or negative empty-state phrasing. `manifest.json` is in the
copy-sweep scan list; if the implementer edits any meaning or written form,
re-run the sweep before finishing.

### Perceived speed & accessibility (QUALITY BAR §1, §2, §6)
- Entry detail and practice paint their layout immediately with a loading
  skeleton in place while blobs read from IndexedDB. No white screen, no
  layout shift when audio arrives.
- Record-back and two-voice Play flip their pressed/active state synchronously
  on tap, before any async blob read or `audio.play()`, so feedback is within
  100ms (the pattern `useRecorder`, `RecordButton`, and `AudioPlayer` already
  use).
- The practice due query and the attempt list are indexed and capped; no hot
  path gets slower as the family records more.
- Everything usable at 390px with no horizontal scroll: the two-voice Play,
  record-back control, and attempt rows stack in the single content column.
  The record control keeps its 96px size; play/skip/save controls use existing
  `.btn` styles (≥44px).
- All controls are real `<button>`s / links, keyboard reachable, with the
  existing `:focus-visible` outline. Attempt play controls carry an
  accessible label including the attempt's date. Progress readouts are real
  text, not images. Meaningful audio controls are labeled, not icon-only
  without an `aria-label` (follow `AudioPlayer`'s existing labeling).

---

## Ordered task list (each with concrete acceptance criteria)

**T1 — Revisit schedule math (`src/lib/revisit.ts`) + tests.**
Add `INTERVAL_DAYS` and `nextRevisit`.
- AC: `nextRevisit(0, t)` → index 1, `dueAt = t + 1 day`; `nextRevisit(1, t)`
  → index 2, `+3 days`; index 2 → `+7`; index 3 → `+14`; index 4 → `+30`;
  index 5 and above → index+1 with `+30 days` (capped). No randomness, no
  `Date` read inside the function (the caller passes `now`).

**T2 — DB migration + attempts + revisit APIs (`src/lib/db.ts`) + tests.**
Bump `DB_VERSION` to 2; add the `attempts` and `revisit` stores in `case 1:`;
backfill revisit rows for existing entries; add `saveAttempt`, `listAttempts`,
`getLatestAttempt`, `getAttemptAudio`, `listDueEntries`, `countDueEntries`;
make `saveEntryWithRecording` also write a revisit row atomically.
- AC: Opening a fresh DB creates all v1 stores plus `attempts` (index
  `by-entry`) and `revisit` (index `by-dueAt`). A DB that already holds v1
  entries gets a `revisit` row per existing entry with `dueAt === createdAt`,
  and NO existing entry/recording/blob row is changed. `saveEntryWithRecording`
  writes an entry AND a revisit row `{intervalIndex:0, dueAt≈now}` in one
  transaction. `saveAttempt` writes the blob, an `Attempt` with `recordedAt`,
  and advances the revisit row per `nextRevisit`, all atomically; the elder
  recording and every prior attempt are untouched. `listAttempts` returns
  newest first and is capped. `listDueEntries(now)` returns only entries whose
  `dueAt <= now`, ordered most-overdue first, capped, via the index (no full
  scan); entries due in the future are excluded.

**T3 — Two-voice playback + record-back on entry detail
(`src/routes/EntryDetail.tsx`) + tests.**
Sequential elder→latest-attempt Play, one-tap record-back writing an attempt,
attempt history with per-attempt playback.
- AC: With no attempt, Play plays only the elder recording and the record-back
  control invites the first attempt. Recording a record-back stores an attempt
  with a date, preserves the elder original and all prior attempts, and the new
  attempt appears in the history and is individually playable. With at least
  one attempt, Play plays the elder recording and then the most recent attempt
  in sequence (elder first, attempt second). Pressed/active feedback on Play
  and on record appears within 100ms. Recorder-permission and unsupported
  states reuse the existing designed copy.

**T4 — Practice screen (`src/routes/Practice.tsx`) + route + tests.**
Due-queue loop with record-back and a designed empty state; register
`/practice`.
- AC: The practice screen surfaces entries whose `dueAt <= now`, one at a time,
  with the elder playable and a one-tap record-back. Completing a record-back
  advances that entry to the next interval (its `dueAt` moves into the future
  so it leaves the due window) and the screen moves to the next due entry. When
  the queue is empty (on load or after the last due entry), a designed empty
  state with positive copy and a clear primary action shows, never a blank
  region. No streak, badge, or notification is shown or sent.

**T5 — Home practice entry point + wiring (`src/routes/Home.tsx`, `App.tsx`).**
- AC: Home keeps exactly one primary action (Start recording → `/interview`).
  A subordinate Practice link to `/practice` appears when there is at least one
  entry to practice and is visibly subordinate to the primary. `/practice` is
  registered and reachable; all existing routes still work.

**T6 — Demo seed with two-voice entries (`public/demo/*`, `seedDemo.ts`) +
tests.**
Bundle the authored demo dictionary with real audible elder and child clips;
extend the manifest and loader for a child attempt per entry.
- AC: With `SEED_DEMO` set and an empty database, the app loads at least 5 demo
  entries, at least 3 of them with both an elder recording and a child attempt,
  so a two-voice entry is playable within a minute of opening with no
  hand-crafted input. Demo audio files are real and audible (not silent/empty),
  and elder vs child are distinct. The loader still seeds at most once, marks
  `demoSeeded`, and swallows a missing/bad asset without crashing. With
  `SEED_DEMO` unset, nothing is seeded. `manifest.json` passes the copy sweep.

**T7 — Accessibility, 390px, copy sweep, and full-suite regression.**
- AC: Keyboard alone reaches and operates two-voice Play, record-back,
  per-attempt play, and the practice controls, each with a visible focus ring;
  the record control is ≥44px. No horizontal scroll at 390px on entry detail
  and practice. The mechanical copy sweep (including `manifest.json` and all
  new/changed routes/components under `src/routes` and `src/components`) finds
  zero `—`/`–`, zero banned vocabulary, zero negative empty-state phrasing.
  `npm run build`, the unit/component suite (Vitest), and the e2e suite
  (Playwright) all pass in the foreground. `/new`, `/interview`, `/dictionary`,
  and the existing capture path still work; no dead imports.

---

## Test plan (which automated test proves each criterion)

Unit (Vitest):
- `src/lib/revisit.test.ts`: asserts every step of `nextRevisit` including the
  +30-day cap → proves the fixed-expanding-interval criterion (T1).
- `src/lib/db.test.ts` (extend, using `fake-indexeddb` and
  `_resetDBForTests`): fresh-DB store/index creation; v1→v2 backfill creates a
  revisit row per existing entry with `dueAt === createdAt` and leaves entries
  untouched; `saveEntryWithRecording` writes the revisit row; `saveAttempt`
  appends an attempt, advances the schedule, and preserves the elder plus prior
  attempts atomically; `listAttempts` newest-first and capped;
  `listDueEntries` returns only currently-due entries via the index, ordered
  and capped, excluding future-due → proves the model, attempt-history, and
  due-queue criteria (T2, and the storage half of T3/T4).

Component (Vitest + RTL + `fake-indexeddb`, mocked recorder like
`NewEntry.test.tsx` / `useRecorder.test.tsx`; stub `HTMLMediaElement.play`):
- `src/routes/EntryDetail.test.tsx`: an entry with no attempt shows Play
  invoking only the elder audio and a record-back invite; simulate
  record → stop → asserts one `attempts` row written for this entry, the elder
  recording unchanged, the attempt visible in history and individually
  playable; with an attempt present, tapping Play calls `play()` on the elder
  source then the attempt source in that order (assert call order on the
  stub) → proves the two-voice and record-back criteria (T3).
- `src/routes/Practice.test.tsx`: seed entries with `dueAt` in the past and in
  the future; assert only due ones surface; simulate a record-back and assert
  the entry advances (leaves the queue / `dueAt` now future) and the next due
  entry shows; with no due entries assert the designed empty state renders with
  positive copy → proves the practice-surfacing, advance, and empty-state
  criteria (T4).
- `src/lib/seedDemo.test.ts` (extend): a manifest entry carrying an `attempt`
  seeds one entry AND one attempt (assert `countEntries` and
  `listAttempts(entryId).length`); an entry without `attempt` seeds elder only;
  a bad attempt asset is skipped without crashing → proves the seed-with-
  attempt criterion (T6, unit half).

E2E (Playwright, Chromium fake-media flags, viewport 390px),
`e2e/practice.spec.ts`:
- Create an entry (via `/interview` or `/new`), open it, record a record-back,
  and assert the attempt appears with a date and is individually playable;
  assert the two-voice Play control is present and its pressed state toggles
  synchronously (feedback within 100ms) → proves two-voice + record-back at
  390px.
- From Home, follow the Practice link, complete a record-back on the due entry,
  and assert it advances (queue count drops or empty state shows); assert no
  horizontal scroll throughout → proves the practice loop and 390px criteria.
- Keyboard: Tab to the record-back and two-voice Play controls and assert a
  visible focus state; assert the record control bounding box is ≥44px →
  proves the keyboard/focus and touch-target criteria.
- Keep the existing `e2e/capture.spec.ts` / `e2e/interview.spec.ts` green;
  update only expectations that a new route changes, without deleting any
  existing flow.

Copy sweep (part of DONE):
- `src/test/copySweep.test.ts` already scans `src/routes`, `src/components`,
  and `public/demo/manifest.json`; the new routes/components and the edited
  manifest fall under it automatically. Zero hits across all of them → proves
  the copy-sweep criterion (T7). If any new user-visible string lives outside
  those scanned locations, add its file to the sweep's scan list.

Run the whole suite (`npm run build`, unit/component, then e2e) in the
foreground to completion before finishing. Verify the demo audio is genuinely
audible (not silent) as part of confirming T6.
