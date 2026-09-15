import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getAttemptAudio,
  getEntry,
  getEntryAudio,
  getLatestAttempt,
  listAttempts,
  saveAttempt,
  type Attempt,
  type Entry,
} from "../lib/db";
import type { Recording } from "../lib/audio";
import { TwoVoicePlayer } from "../components/TwoVoicePlayer";
import { AttemptList } from "../components/AttemptList";
import { RecordBack } from "../components/RecordBack";
import { EmptyState } from "../components/states/EmptyState";
import { LoadingSkeleton } from "../components/states/LoadingSkeleton";

interface Loaded {
  entry: Entry;
  elderBlob: Blob | null;
  latestAttemptBlob: Blob | null;
  attempts: Attempt[];
}

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; data: Loaded };

// One entry: the two-voice moment, a one-tap record-back, and the voice history.
export function EntryDetail() {
  const { id } = useParams<{ id: string }>();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  const refreshAttempts = useCallback(async (entry: Entry) => {
    const attempts = await listAttempts(entry.id);
    const latest = await getLatestAttempt(entry.id);
    const latestBlob = latest
      ? ((await getAttemptAudio(latest))?.blob ?? null)
      : null;
    return { attempts, latestBlob };
  }, []);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!id) {
        if (alive) setLoad({ status: "missing" });
        return;
      }
      const entry = await getEntry(id);
      if (!entry) {
        if (alive) setLoad({ status: "missing" });
        return;
      }
      const elderBlob = (await getEntryAudio(entry))?.blob ?? null;
      const { attempts, latestBlob } = await refreshAttempts(entry);
      if (alive)
        setLoad({
          status: "ready",
          data: {
            entry,
            elderBlob,
            latestAttemptBlob: latestBlob,
            attempts,
          },
        });
    }
    void run();
    return () => {
      alive = false;
    };
  }, [id, refreshAttempts]);

  const handleCapture = useCallback(
    async (recording: Recording) => {
      if (load.status !== "ready") return;
      const entry = load.data.entry;
      await saveAttempt(entry.id, {
        blob: recording.blob,
        mimeType: recording.mimeType,
        durationMs: recording.durationMs,
      });
      const { attempts, latestBlob } = await refreshAttempts(entry);
      setLoad((prev) =>
        prev.status === "ready"
          ? {
              status: "ready",
              data: {
                ...prev.data,
                attempts,
                latestAttemptBlob: latestBlob,
              },
            }
          : prev,
      );
    },
    [load, refreshAttempts],
  );

  if (load.status === "loading") {
    return (
      <div className="stack">
        <LoadingSkeleton rows={3} />
      </div>
    );
  }

  if (load.status === "missing") {
    return (
      <div className="stack">
        <EmptyState
          icon="📖"
          title="This word is not here"
          body="It may have been removed. Open the dictionary to see your words."
          action={
            <Link to="/dictionary" className="btn btn--primary">
              Open the dictionary
            </Link>
          }
        />
      </div>
    );
  }

  const { entry, elderBlob, latestAttemptBlob, attempts } = load.data;
  const title = entry.writtenForm || entry.meaning;
  const hasAttempt = attempts.length > 0;

  return (
    <div className="stack">
      <p className="muted">
        <Link to="/dictionary">Back to dictionary</Link>
      </p>

      <div className="card stack">
        <h1 style={{ margin: 0 }}>{title}</h1>
        {entry.writtenForm ? <p style={{ margin: 0 }}>{entry.meaning}</p> : null}
        <TwoVoicePlayer elderBlob={elderBlob} attemptBlob={latestAttemptBlob} />
      </div>

      <RecordBack
        label={hasAttempt ? "Say it back again" : "Say it back"}
        onCapture={handleCapture}
      />

      <AttemptList elderBlob={elderBlob} attempts={attempts} title={title} />

      <Link to="/new" className="btn btn--ghost btn--block">
        Record another word
      </Link>
    </div>
  );
}
