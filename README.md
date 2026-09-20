# Grandma's Dictionary

Record a family elder saying the words, names, and sayings in your family's
language, and keep them in their own voice. A child hears the elder, says the
word back, and both voices sit side by side in one file your family owns. It
runs in the browser with no account and no setup, and everything stays on your
device.

A guided interview walks you through prompts and records each answer into your
talking dictionary. Open a word to play the elder and then the child saying it
back, one tap for both voices. Practice surfaces words to revisit on a spreading
schedule. The data screen saves the whole dictionary as one zip file, with a
readable manifest and the audio files inside, and opens a saved file on any
device to merge those words in without duplicating what is already there.

## Run it

You need [Node.js 22+](https://nodejs.org) for local development, or Docker to
run the built app.

### Local development

```bash
git clone <this-repo-url> grandmas-dictionary
cd grandmas-dictionary
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173). Recording needs
microphone access, which the browser grants on `localhost` and over https.

### Run the container

```bash
docker build -t grandmas-dictionary .
docker run --rm -p 8080:80 grandmas-dictionary
```

Open http://localhost:8080. The health check is at `/healthz`.

Runtime settings are read from environment variables and written into
`config.js` when the container starts, so one image serves any environment. All
are optional:

| Variable           | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `SEED_DEMO`        | Loads a bundled demo dictionary on first open. |
| `UMAMI_URL`        | Umami analytics script URL.                    |
| `UMAMI_WEBSITE_ID` | Umami website id.                              |
| `SENTRY_DSN`       | Error tracking DSN (Sentry or GlitchTip).      |

Copy `.env.example` to `.env` to set them. Leave a value empty to keep that
channel off. Analytics and error reports never include entry text, audio, or
personal data.

To try the app with a sample dictionary, set `SEED_DEMO=1`, for example
`docker run --rm -e SEED_DEMO=1 -p 8080:80 grandmas-dictionary`. It loads a small
demo on first open so the two-voice moment plays right away. The deploy config in
`docker-compose.staging.yml` sets this flag for you.

## How it works

A single-page React app. Words, recordings, and audio are stored locally in
IndexedDB, so the dictionary belongs to the device and works offline after the
first load. There is no application server and no account. The only server job
is serving the static files and answering the health check.

## Develop and test

- `npm run dev` runs the app with hot reload.
- `npm run build` produces the static bundle in `dist/`.
- `npm test` runs the unit and component tests (Vitest).
- `npm run test:e2e` runs the browser tests (Playwright). `bash scripts/e2e.sh`
  runs them in the pinned Playwright container, which is how CI runs them. Each
  run starts from a clean profile, so no state carries between runs.
- `npm run smoke` builds the container, checks `/healthz` and that real content
  is served, then tears the stack down.

Code layout:

- `src/routes`: the screens (home, guided interview, record, dictionary, entry
  detail with the two-voice moment and record-back, practice, and the data
  screen for backup files).
- `src/components`: the record control, audio players, the two-voice player,
  the voice history, the export nudge, and designed empty, loading, and error
  states.
- `src/lib`: IndexedDB access and migrations (`db.ts`), audio capture
  (`audio.ts`), the zip backup format (`archive.ts`), the revisit schedule
  (`revisit.ts`), storage status (`storage.ts`), runtime config, demo seeding,
  and telemetry.

## License

MIT. See [LICENSE](LICENSE).
