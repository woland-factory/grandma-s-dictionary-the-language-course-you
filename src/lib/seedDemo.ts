import { seedDemoEnabled } from "./config";
import {
  countEntries,
  getMeta,
  saveEntryWithRecording,
  setMeta,
} from "./db";

// Demo manifest shape (EPIC 3 fills the entries and audio files). This EPIC
// ships an empty manifest, and the loader must complete cleanly on it.
interface ManifestEntry {
  writtenForm?: string;
  meaning: string;
  category: string;
  promptId?: string;
  audio: string; // path under public/, e.g. "demo/audio/word.webm"
  durationMs: number;
}

interface Manifest {
  schemaVersion: number;
  entries: ManifestEntry[];
}

const DEMO_SEEDED_KEY = "demoSeeded";
const MANIFEST_URL = "demo/manifest.json";

// Loads the bundled demo dictionary at most once per database when SEED_DEMO is
// set and the entries store is empty. Any failure (missing manifest, missing
// audio file, network error) is swallowed so a bad demo asset never blocks the
// real app. Seeding still marks demoSeeded so it does not retry every boot.
export async function maybeSeedDemo(): Promise<void> {
  if (!seedDemoEnabled) return;

  const alreadySeeded = await getMeta<boolean>(DEMO_SEEDED_KEY);
  if (alreadySeeded) return;

  if ((await countEntries()) > 0) {
    // A real dictionary already exists; do not touch it, but stop retrying.
    await setMeta(DEMO_SEEDED_KEY, true);
    return;
  }

  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (res.ok) {
      const manifest = (await res.json()) as Manifest;
      const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
      for (const item of entries) {
        await seedOne(item);
      }
    }
  } catch {
    // Ignore: a missing or malformed manifest must not crash the app.
  }

  await setMeta(DEMO_SEEDED_KEY, true);
}

async function seedOne(item: ManifestEntry): Promise<void> {
  try {
    const audioRes = await fetch(item.audio, { cache: "no-store" });
    if (!audioRes.ok) return;
    const blob = await audioRes.blob();
    await saveEntryWithRecording({
      writtenForm: item.writtenForm,
      meaning: item.meaning,
      category: item.category,
      promptId: item.promptId,
      audio: {
        blob,
        mimeType: blob.type || "audio/webm",
        durationMs: item.durationMs,
      },
    });
  } catch {
    // Skip a single bad entry; keep loading the rest.
  }
}
