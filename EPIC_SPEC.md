# EPIC 2 SPEC — The guided interview

## Quality differentiator (this EPIC is held to it)

**Radical simplicity of capture.** A non-technical grandparent and a busy
parent produce a complete, playable, owned talking dictionary in one
kitchen-table sitting, with no account and no setup. This EPIC IS the capture
engine, so it is judged on this dimension directly, not just the baseline bar.

What it demands of THIS EPIC's work: the interview must feel like a warm,
guided conversation, not a form. From a cold home screen the user reaches the
first question and starts recording in two taps, with no account, no
family-name form, no category picker, and no settings first. Each answer costs
one record and, at most, a few optional keystrokes. A single sitting must
plausibly yield 20 or more entries because nothing on the per-prompt path slows
the family down. Every extra tap, required field, or wait on this path is a
defect against the differentiator, not just the baseline bar.

---

## Scope

### In scope
- A bundled **static prompt deck** shipped with the app (no network, no LLM):
  categories and prompts as typed TypeScript data. At least 30 prompts across
  the six named categories.
- A `/interview` route: a **one-prompt-at-a-time** guided flow with a progress
  indicator, one-tap record, re-record, skip, next, and an optional written
  form + meaning per answer.
- Each saved answer becomes a dictionary `entry` tagged with its `promptId` and
  `category`, saved through the existing `saveEntryWithRecording` path.
- A **session summary** screen at the end of a pass (or when the user ends the
  session) showing how many entries were captured this sitting, with a way into
  the dictionary and a way to keep going.
- Home's primary action starts the interview. The dictionary's capture action
  points at the interview too, so the interview is the app's capture surface.
- The dictionary list shows each entry's category as a small tag (the visible
  proof that answers are tagged).

### Out of scope (Non-goals — binding, do NOT build)
- **No LLM-generated prompts.** The deck is hand-authored static data. No
  runtime LLM, no bring-your-own-key surface, no gateway grant.
- **No user-editable deck.** No UI to add, reorder, hide, or rewrite prompts or
  categories. The deck is read-only bundled data.
- **No branching questionnaires.** Prompts are a single fixed ordered list.
  Answering, skipping, or the category of a prompt never changes which prompt
  comes next.
- **No record-back, attempts, two-voice playback, or practice / spaced-revisit
  queue** (EPIC 3). Do not add an `attempts` store, `dueAt`, or a `/practice`
  route.
- **No export / import or `/data` screen** (EPIC 4).
- **No formal guided first-run walkthrough** (the skippable 2–4 step path is
  EPIC 5). This EPIC delivers a clear first-run home and first prompt that lead
  a new user to record without documentation; it must NOT build the
  step-by-step walkthrough overlay.
- **No category filtering, grouping, or sorting UI in the dictionary.** Showing
  a per-entry category tag is in scope; a category browser is not.
- **No demo/seed content changes.** The `SEED_DEMO` manifest stays empty here
  (EPIC 3 fills it).

### Security / data posture (unchanged from EPIC 1, restate so reviewers do not
mis-flag it)
This remains a static client with no application API. The interview adds no
server route and no network call: the deck is bundled, all answers stay in
IndexedDB on the device. QUALITY BAR §5 is met exactly as in EPIC 1: input is
validated at the CLIENT boundary (field length caps and audio caps already in
`audio.ts`), no secrets in code, no PII in any beacon. Server-side authorization
and rate limiting stay N/A because no mutation route exists.

---

## Technical design

The heavy lifting already exists from EPIC 1. This EPIC is mostly a new route,
a static data file, and small wiring. **No IndexedDB schema change and no
`DB_VERSION` bump:** `Entry` already carries `category` and `promptId`, and
`saveEntryWithRecording` already accepts `category` and `promptId`
(`src/lib/db.ts`). Do not touch the migration framework.

### Files to add
```
src/data/deck.ts            # the static deck: categories + prompts + helpers
src/routes/Interview.tsx    # the guided interview flow + session summary
src/data/deck.test.ts       # deck shape, size, and programmatic copy sweep
src/routes/Interview.test.tsx  # component tests for the flow
e2e/interview.spec.ts       # 390px end-to-end: two taps to record → summary
```
Small optional splits (implementer's discretion, same responsibilities): a
`PromptCard` and/or `InterviewSummary` component under `src/components/`. Do not
add a component library or abstraction layer for three screens.

### Files to change
```
src/App.tsx                 # register the /interview route
src/routes/Home.tsx         # primary action -> /interview (see below)
src/routes/Dictionary.tsx   # "Record" action -> /interview; show category tag
src/test/copySweep.test.ts  # add src/data/deck.ts to the scan list
```
`src/routes/NewEntry.tsx` and the `/new` route stay registered and working
exactly as they are. They are not this EPIC's concern beyond no longer being
the primary path. Do not rewrite or delete them.

### The deck (`src/data/deck.ts`)

Shape (types are illustrative; keep them this simple):
```ts
export type CategoryId =
  | "foods"
  | "endearments"
  | "blessings"
  | "for-children"
  | "family-words"
  | "kinship";

export interface Category {
  id: CategoryId;
  label: string;        // user-visible; passes the copy sweep
}

export interface Prompt {
  id: string;           // stable, unique, e.g. "kinship-grandmother"
  category: CategoryId;
  text: string;         // the question shown on screen; user-visible
  defaultMeaning: string; // short gloss used as entry.meaning when the
                          // family types none; user-visible
}

export const CATEGORIES: Category[] = [ /* the six below */ ];
export const DECK: Prompt[] = [ /* the >=30 below, in this order */ ];
export function categoryLabel(id: CategoryId): string { /* lookup */ }
```

Rules the deck must satisfy (all asserted by `deck.test.ts`):
- `DECK.length >= 30` and every category in `CATEGORIES` appears in `DECK`.
- Every `Prompt.id` is unique and non-empty; every `Prompt.category` matches a
  `CATEGORIES` id.
- `text` and `defaultMeaning` are non-empty and pass the banned-pattern sweep.
- `DECK` is a fixed order (authored order below). It is never shuffled.
  Shuffling would need randomness (banned in this environment for
  determinism) and would break deterministic tests; ship it in order.

**Authored deck (ship this content verbatim; it is pre-swept).** Category
labels first, then prompts grouped by category. `defaultMeaning` is the gloss in
parentheses; use it as the entry meaning when the family types nothing.

Categories:
- `foods` → label **"Foods"**
- `endearments` → label **"Endearments"**
- `blessings` → label **"Blessings"**
- `for-children` → label **"Words for little ones"**
- `family-words` → label **"Family words"**
- `kinship` → label **"Family names"**

Prompts (33 total, 6 categories):

Foods
1. `foods-family-dish` — "A dish only your family makes. What is it called?" (a family dish)
2. `foods-celebration` — "The food you cooked for a celebration. Say its name." (celebration food)
3. `foods-sweet` — "A sweet or treat from your childhood. What did you call it?" (a childhood treat)
4. `foods-staple` — "Your everyday bread or rice. Say its name." (an everyday staple)
5. `foods-drink` — "A drink your family shared at the table. What is it called?" (a family drink)
6. `foods-kitchen-smell` — "The smell from your mother's kitchen. What food was it?" (a remembered food)

Endearments
7. `endearments-loved-one` — "What you call someone you love. Say it out loud." (a word of love)
8. `endearments-little-one` — "The pet name for a little one in your family." (a pet name for a child)
9. `endearments-sweetheart` — "A name you called your sweetheart." (a name for a sweetheart)
10. `endearments-baby-name` — "What your parents called you as a baby." (a baby name)
11. `endearments-still-use` — "A tender word you still use today." (a tender word)

Blessings
12. `blessings-meal` — "What you say before a meal." (a mealtime blessing)
13. `blessings-travel` — "A blessing for someone leaving on a trip." (a blessing for travel)
14. `blessings-new-baby` — "Words you say over a new baby." (a blessing for a baby)
15. `blessings-birthday` — "What you wish someone on their birthday." (a birthday wish)
16. `blessings-family-prayer` — "A prayer or blessing your family repeats." (a family blessing)
17. `blessings-sneeze` — "What you say when someone sneezes." (what you say when someone sneezes)

Words for little ones
18. `for-children-wake` — "What you say to wake a child in the morning." (waking a child)
19. `for-children-careful` — "How you tell a child to take care." (telling a child to take care)
20. `for-children-comfort` — "The words you use to comfort a crying child." (comforting a child)
21. `for-children-rhyme` — "A little rhyme or song for a baby." (a rhyme for a baby)
22. `for-children-bedtime` — "What you say at bedtime." (a bedtime saying)

Family words
23. `family-words-only-us` — "A word only your family uses. Say it." (a family word)
24. `family-words-place` — "The nickname your family gave a place." (a family name for a place)
25. `family-words-everyday` — "A made-up word for an everyday thing." (a made-up everyday word)
26. `family-words-child-made` — "A funny word a child in the family created." (a child's invented word)
27. `family-words-private` — "A word your family uses that outsiders would miss." (a private family word)

Family names
28. `kinship-grandmother` — "What you called your grandmother." (grandmother)
29. `kinship-grandfather` — "What you called your grandfather." (grandfather)
30. `kinship-mother` — "The word for mother in your language." (mother)
31. `kinship-father` — "The word for father in your language." (father)
32. `kinship-aunt-uncle` — "What you call an aunt or uncle." (aunt or uncle)
33. `kinship-sibling` — "The word for a brother or sister." (brother or sister)

Copy note: none of the above uses "—"/"–", banned vocabulary, or negative
empty-state phrasing. If the implementer edits any string, re-run the sweep
(the deck test enforces it) before finishing.

### The interview flow (`src/routes/Interview.tsx`)

Reuse the existing capture pieces: `useRecorder`, `RecordButton`,
`AudioPlayer`, `detectCapabilities`, `saveEntryWithRecording`, and the
`ErrorState` / recorder-error patterns already in `NewEntry.tsx`. Do not build
a second recorder.

State: current prompt index (0-based into `DECK`), the just-captured
`Recording | null`, optional `writtenForm` and `meaning` strings, a
per-session `capturedCount`, and a `phase` of `"prompt" | "summary"`.

Per-prompt view (`phase === "prompt"`):
- **Header / progress.** Show the category label and a text progress readout
  ("3 of 33") that a screen reader can read. A thin visual progress bar is
  allowed but the text readout is required.
- **Prompt.** Show `prompt.text` prominently as the one thing to ask.
- **Before recording:** the `RecordButton` (the one primary action) plus a
  visibly subordinate **Skip** control. Tapping record starts capture with
  feedback within 100ms (already guaranteed by `useRecorder`). No setup form,
  no fields shown yet.
- **After stop:** show `AudioPlayer` for the just-recorded clip, a **Record
  again** control (re-record: clear the recording and reset the recorder), the
  optional **Written form** and **What it means** fields (both optional here,
  unlike `/new`), and the primary **Save and next**. Skip remains available.
- **Save and next:** call `saveEntryWithRecording({ promptId: prompt.id,
  category: prompt.category, writtenForm: cleanWrittenForm(writtenForm) ||
  undefined, meaning: cleanMeaning(meaning) || prompt.defaultMeaning, audio })`.
  Increment `capturedCount`. Advance to the next prompt (reset recording and
  fields). Meaning is never empty because it falls back to `defaultMeaning`.
- **Skip / Next:** advance to the next prompt without saving. Never writes an
  entry.
- **Advancing past the last prompt** (via save or skip) moves to
  `phase === "summary"`.
- **End early:** a subordinate "Done for now" control jumps straight to the
  summary at any point.

Session summary view (`phase === "summary"`):
- Show `capturedCount`: e.g. a heading with the number and a short line. Use
  positive phrasing. When `capturedCount === 0`, show an encouraging invite to
  record (keep it positive and clear of the banned negative empty-state
  phrasing).
- Primary action: **Open the dictionary** (`/dictionary`). Secondary: **Start
  again** (reset to the first prompt) or **Back to start** (`/`). One obvious
  primary; secondaries subordinate.

Failure states: if `detectCapabilities().canRecord` is false, or the recorder
reports an error, reuse the exact designed states from `NewEntry.tsx`
(unsupported / insecure-context / denied / not-found). Do not invent new copy;
lift the existing patterns.

### Home (`src/routes/Home.tsx`)
- The primary action becomes **Start recording** linking to `/interview` (this
  is what makes "two taps to record" true: tap 1 lands on the first prompt, tap
  2 is the record button). Keep it as the single obvious primary action
  (`btn--primary btn--block`).
- Keep the secondary "Open the dictionary (n)" link when `n > 0`. Keep
  `StorageStatusBar`.
- The headline and helper copy stay warm and short; re-run the sweep on any
  string you change.

### Dictionary (`src/routes/Dictionary.tsx`)
- The "Record" action routes to `/interview`.
- Render each entry's category as a small tag using `categoryLabel(entry.category)`.
  Entries created before this EPIC (or the `/new` path) carry
  `category === "uncategorized"`; render nothing (or a neutral omission) for
  that value rather than an empty tag. Do not add filtering or grouping.

### App (`src/App.tsx`)
- Register `<Route path="/interview" element={<Interview />} />`. Leave `/new`,
  `/dictionary`, `/entry/:id`, and the `*` NotFound route in place.

### Perceived speed & accessibility (QUALITY BAR §1, §2, §6)
- First prompt paints immediately from bundled data (no network, no DB read
  needed to show the first question). No blank screen.
- Record feedback within 100ms is already handled by `useRecorder` /
  `RecordButton`; the interview must not gate the button on any async work.
- Everything usable at 390px with no horizontal scroll. The record control
  keeps its existing size (`.record-btn` is 96px, well above the 44px floor);
  Skip / Next / Save use existing `.btn` styles (min-height 44–48px).
- Record, Skip, Next, and Save are real `<button>`s, keyboard reachable, with
  the existing `:focus-visible` outline. Inputs keep visible `<label>`s. The
  progress readout is real text, not an image.

---

## Ordered task list (each with acceptance criteria)

**T1 — The static deck (`src/data/deck.ts`) + deck tests.**
Author `CATEGORIES`, `DECK`, and `categoryLabel` exactly as specified above.
- AC: `DECK.length >= 30`; every one of the six categories appears; all
  `Prompt.id`s unique; every `category` valid; `text`/`defaultMeaning`
  non-empty. `deck.test.ts` asserts these and runs the banned-pattern sweep
  over every `text` and every category `label`, finding zero hits. No network
  or LLM is used.

**T2 — Interview flow, per-prompt (`src/routes/Interview.tsx`) + route.**
One-prompt-at-a-time view with progress, record (reusing `RecordButton` /
`useRecorder`), re-record, optional fields, Skip, Save and next. Register
`/interview`.
- AC: The first prompt and record button render immediately with no account
  step, no family-name form, and no category picker before recording. Progress
  shows "1 of N". Skip advances without writing an entry. Recording then
  saving writes ONE entry whose `promptId` and `category` match the current
  prompt, then advances. Meaning defaults to the prompt's `defaultMeaning` when
  the family types none; a typed meaning or written form is saved instead/also.

**T3 — Session summary.**
Summary view at the end of a pass and via "Done for now".
- AC: Completing or ending a pass lands on a summary showing the count captured
  this session. The count matches the number of saves. The summary offers Open
  the dictionary as its primary action. A zero-capture summary shows a positive
  invite, not banned/negative phrasing.

**T4 — Home + Dictionary wiring.**
Home primary action → `/interview`; Dictionary "Record" → `/interview`; entry
category tag in the list.
- AC: From Home, two taps reach an active recording (tap 1 opens the first
  prompt, tap 2 starts recording, `aria-pressed="true"`). No setup form
  intervenes. Each dictionary entry shows its category label; `uncategorized`
  entries show no tag. No filtering/grouping added. One obvious primary action
  per screen.

**T5 — Accessibility, 390px, and the copy sweep.**
Keyboard reach + visible focus on Record, Skip, Next, Save; labeled inputs; no
horizontal scroll at 390px; record control ~44px+ (it is 96px). Add
`src/data/deck.ts` to `src/test/copySweep.test.ts`'s scan list and run the full
sweep.
- AC: Keyboard alone can move through Record, Skip, Next, and Save with a
  visible focus ring; the record control is at least 44px. No horizontal scroll
  at 390px on `/interview` and the summary. The mechanical copy sweep
  (including the deck file and all deck strings) finds zero `—`/`–`, zero banned
  vocabulary, zero negative empty-state phrasing.

**T6 — Regression check on the existing capture path.**
Home no longer defaults to `/new`; update the affected EPIC-1 e2e so the suite
stays green, without deleting `/new` or `NewEntry`.
- AC: `npm run build`, the unit/component suite, and the e2e suite all pass in
  the foreground. The `/new` route still records and saves. No dead imports.

---

## Test plan (which automated test proves each criterion)

Unit (Vitest):
- `src/data/deck.test.ts`: `DECK.length >= 30`; all six categories present;
  unique ids; valid category refs; non-empty `text`/`defaultMeaning`;
  programmatic banned-pattern sweep over every `prompt.text` and every
  `category.label` → proves the "≥30 prompts across ≥5 categories, bundled, no
  network" criterion and the deck half of the copy-sweep criterion.

Component (Vitest + RTL + `fake-indexeddb`, mocked recorder like the existing
`NewEntry.test.tsx` / `useRecorder.test.tsx`), `src/routes/Interview.test.tsx`:
- First render shows a prompt and the record button with no setup form; progress
  reads "1 of N" → proves the no-setup-first criterion.
- Simulate record → stop → Save and next: asserts one `entries` row written
  with the current `promptId` and `category`, that `meaning` equals the prompt's
  `defaultMeaning` when no text was typed, and that a typed meaning/written form
  is persisted when provided → proves the "tagged entry, meaning optional"
  criterion.
- Skip advances without adding an entry → proves skip adds no friction/rows.
- Reaching the end (or "Done for now") shows the summary with the correct
  captured count → proves the session-summary criterion.

E2E (Playwright, Chromium fake-media flags, viewport 390px),
`e2e/interview.spec.ts`:
- From `/`, click the Home primary (tap 1), assert the first prompt is visible;
  click the record button (tap 2), assert `aria-pressed="true"` with no
  intervening form → proves the two-taps-to-record criterion.
- Record → stop → Save and next across two prompts, skip one, then end and land
  on the summary showing a count of 2; open the dictionary and assert both
  entries appear, each with a category tag; assert no horizontal scroll
  throughout → proves the full-pass, summary, tagging, and 390px criteria.
- Keyboard: Tab to the record control and Skip and assert a visible focus state;
  assert the record button's bounding box is ≥44px → proves the keyboard/focus
  and ~44px criteria.
- Update the EPIC-1 `e2e/capture.spec.ts` expectations that assumed Home →
  `/new`, so the suite stays green (the `/new` flow itself is unchanged and can
  be reached directly).

Copy sweep (part of DONE):
- `src/test/copySweep.test.ts` gains `src/data/deck.ts` in its scan list;
  `Interview.tsx` and the changed `Home.tsx` / `Dictionary.tsx` live under
  `src/routes` and are already scanned. Zero hits across all of them plus the
  programmatic deck sweep → proves the "all prompt text and category labels
  pass the copy sweep" criterion.

Run the whole suite (`npm run build`, unit/component, e2e) in the foreground to
completion before finishing.
