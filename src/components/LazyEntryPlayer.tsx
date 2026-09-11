import { useEffect, useRef, useState } from "react";
import { getEntryAudio, type Entry } from "../lib/db";

// Play control for a list row. The audio blob loads on first tap, so the list
// does not read every blob up front (which would slow down as entries grow).
export function LazyEntryPlayer({ entry }: { entry: Entry }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

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
      setBusy(true);
      const row = await getEntryAudio(entry);
      setBusy(false);
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

  const word = entry.writtenForm || entry.meaning;
  return (
    <button
      type="button"
      className="play-btn"
      onClick={toggle}
      aria-label={playing ? `Pause ${word}` : `Play ${word}`}
      data-testid="entry-play"
    >
      {playing ? (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
        </svg>
      ) : busy ? (
        <span aria-hidden="true">…</span>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
