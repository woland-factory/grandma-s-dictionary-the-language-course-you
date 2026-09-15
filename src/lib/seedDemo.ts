import { seedDemoEnabled } from "./config";
import {
  countEntries,
  getMeta,
  saveAttempt,
  saveEntryWithRecording,
  setMeta,
} from "./db";

// One child record-back bundled beside a demo entry, so the two-voice moment
// plays with no hand-crafted input.
interface ManifestAttempt {
  audio: string; // path under public/, e.g. "demo/audio/word-child.wav"
  durationMs: number;
}

// Demo manifest shape. The loader tolerates entries without `attempt`.
interface ManifestEntry {
  writtenForm?: string;
  meaning: string;
  category: string;
  promptId?: string;
  audio: string; // path under public/, e.g. "demo/audio/word-elder.wav"
  durationMs: number;
  attempt?: ManifestAttempt;
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
    const { entry } = await saveEntryWithRecording({
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

    // A child attempt makes the two-voice moment playable on load. A missing or
    // bad attempt asset skips only the attempt; the elder entry still stands.
    if (item.attempt) {
      try {
        const attemptRes = await fetch(item.attempt.audio, {
          cache: "no-store",
        });
        if (attemptRes.ok) {
          const attemptBlob = await attemptRes.blob();
          await saveAttempt(entry.id, {
            blob: attemptBlob,
            mimeType: attemptBlob.type || "audio/webm",
            durationMs: item.attempt.durationMs,
          });
        }
      } catch {
        // Skip only the attempt; the elder entry is already saved.
      }
    }
  } catch {
    // Skip a single bad entry; keep loading the rest.
  }
}
