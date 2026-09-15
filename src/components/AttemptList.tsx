import { useEffect, useRef, useState } from "react";
import { getAttemptAudio, type Attempt } from "../lib/db";
import { AudioPlayer } from "./AudioPlayer";

// Play control for one attempt row. The audio blob loads on first tap, so the
// history does not read every attempt blob up front (which would slow down as
// attempts accumulate). Mirrors LazyEntryPlayer.
function LazyAttemptPlayer({
  attempt,
  label,
}: {
  attempt: Attempt;
  label: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      audioRef.current = null;
      urlRef.current = null;
    };
  }, []);

  async function toggle() {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
      return;
    }
    setPlaying(true); // synchronous feedback
    if (!audioRef.current) {
      const row = await getAttemptAudio(attempt);
      if (!row) {
        setPlaying(false);
        return;
      }
      const url = URL.createObjectURL(row.blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audio.addEventListener("ended", () => setPlaying(false));
      audio.addEventListener("pause", () => setPlaying(false));
      audioRef.current = audio;
    }
    void audioRef.current.play().catch(() => setPlaying(false));
  }

  return (
    <button
      type="button"
      className="play-btn"
      onClick={toggle}
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      data-testid="attempt-play"
    >
      {playing ? (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

// The full voice history for an entry: the elder original first (always shown
// and playable on its own), then every child attempt newest first, each with
// its date and its own play control. Nothing here mutates or deletes a voice.
export function AttemptList({
  elderBlob,
  attempts,
  title,
}: {
  elderBlob: Blob | null;
  attempts: Attempt[];
  title: string;
}) {
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Voices</h2>
      <ul className="attempt-list">
        <li className="attempt-item">
          <AudioPlayer blob={elderBlob} label={`${title} in their voice`} />
          <div className="attempt-item__body">
            <p className="attempt-item__who">In their voice</p>
          </div>
        </li>
        {attempts.map((attempt) => (
          <li key={attempt.id} className="attempt-item">
            <LazyAttemptPlayer
              attempt={attempt}
              label={`${title} said back on ${formatDate(attempt.recordedAt)}`}
            />
            <div className="attempt-item__body">
              <p className="attempt-item__who">Saying it back</p>
              <p className="attempt-item__date">
                {formatDate(attempt.recordedAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
