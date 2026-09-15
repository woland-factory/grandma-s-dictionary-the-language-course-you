import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getEntryAudio,
  listDueEntries,
  saveAttempt,
  type Entry,
} from "../lib/db";
import type { Recording } from "../lib/audio";
import { AudioPlayer } from "../components/AudioPlayer";
import { ExportNudge } from "../components/ExportNudge";
import { RecordBack } from "../components/RecordBack";
import { EmptyState } from "../components/states/EmptyState";
import { LoadingSkeleton } from "../components/states/LoadingSkeleton";

// One-at-a-time practice over the due queue: hear the elder, say it back, move
// on. Recording advances the entry's schedule (via saveAttempt) so it leaves
// the due window; Skip moves on without recording. A designed empty state shows
// when nothing is due.
export function Practice() {
  const [queue, setQueue] = useState<Entry[] | null>(null);
  const [index, setIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [elderBlob, setElderBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let alive = true;
    void listDueEntries().then((rows) => {
      if (alive) setQueue(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const current = queue && index < queue.length ? queue[index] : null;

  useEffect(() => {
    if (!current) {
      setElderBlob(null);
      return;
    }
    let alive = true;
    void getEntryAudio(current).then((row) => {
      if (alive) setElderBlob(row?.blob ?? null);
    });
    return () => {
      alive = false;
    };
  }, [current]);

  const handleCapture = useCallback(
    async (recording: Recording) => {
      if (!current) return;
      await saveAttempt(current.id, {
        blob: recording.blob,
        mimeType: recording.mimeType,
        durationMs: recording.durationMs,
      });
      setSavedCount((n) => n + 1);
      setIndex((i) => i + 1);
    },
    [current],
  );

  function handleSkip() {
    setIndex((i) => i + 1);
  }

  if (queue === null) {
    return (
      <div className="stack">
        <LoadingSkeleton rows={3} />
      </div>
    );
  }

  if (!current) {
    return <CaughtUp showNudge={savedCount > 0} />;
  }

  const title = current.writtenForm || current.meaning;

  return (
    <div className="stack">
      <p className="practice__progress" data-testid="practice-progress">
        {index + 1} of {queue.length} to practice
      </p>

      <div className="card stack">
        <h1 className="practice__word">{title}</h1>
        {current.writtenForm ? (
          <p style={{ margin: 0 }}>{current.meaning}</p>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AudioPlayer blob={elderBlob} label={`${title} in their voice`} />
          <span className="muted">Play in their voice</span>
        </div>
      </div>

      <RecordBack label="Say it back" onCapture={handleCapture} />

      <button
        type="button"
        className="btn btn--ghost btn--block"
        onClick={handleSkip}
        data-testid="practice-skip"
      >
        Skip for now
      </button>
    </div>
  );
}

function CaughtUp({ showNudge }: { showNudge: boolean }) {
  return (
    <div className="stack">
      <EmptyState
        icon="🌿"
        title="You're all caught up"
        body="Come back later for the next round, or add more words to practice."
        action={
          <Link
            to="/dictionary"
            className="btn btn--primary"
            data-testid="practice-open-dictionary"
          >
            Open the dictionary
          </Link>
        }
      />
      {showNudge ? <ExportNudge /> : null}
      <Link to="/interview" className="btn btn--secondary btn--block">
        Record more words
      </Link>
    </div>
  );
}
