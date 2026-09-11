import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAudioBlob, getEntry, getRecording, type Entry } from "../lib/db";
import { AudioPlayer } from "../components/AudioPlayer";
import { EmptyState } from "../components/states/EmptyState";
import { LoadingSkeleton } from "../components/states/LoadingSkeleton";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; entry: Entry; blob: Blob | null };

// One entry: its written form, meaning, and the elder recording to play back.
export function EntryDetail() {
  const { id } = useParams<{ id: string }>();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

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
      const recording = await getRecording(entry.elderRecordingId);
      const blobRow = recording
        ? await getAudioBlob(recording.audioBlobId)
        : undefined;
      if (alive)
        setLoad({ status: "ready", entry, blob: blobRow?.blob ?? null });
    }
    void run();
    return () => {
      alive = false;
    };
  }, [id]);

  if (load.status === "loading") {
    return (
      <div className="stack">
        <LoadingSkeleton rows={2} />
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

  const { entry, blob } = load;
  const title = entry.writtenForm || entry.meaning;

  return (
    <div className="stack">
      <p className="muted">
        <Link to="/dictionary">Back to dictionary</Link>
      </p>
      <div className="card stack">
        <h1 style={{ margin: 0 }}>{title}</h1>
        {entry.writtenForm ? (
          <p style={{ margin: 0 }}>{entry.meaning}</p>
        ) : null}
        <div
          style={{ display: "flex", alignItems: "center", gap: 12 }}
        >
          <AudioPlayer blob={blob} label={title} />
          <span className="muted">Play in their voice</span>
        </div>
      </div>
      <Link to="/new" className="btn btn--secondary btn--block">
        Record another word
      </Link>
    </div>
  );
}
