import { useEffect, useRef, useState } from "react";

interface AudioPlayerProps {
  blob: Blob | null;
  label: string; // accessible label, e.g. the word being played
}

// Plays a stored audio blob via a temporary object URL, revoked on cleanup so
// blobs are not leaked. Playback is instant because the audio is local.
export function AudioPlayer({ blob, label }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    const onEnd = () => setPlaying(false);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("pause", onEnd);
    return () => {
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("pause", onEnd);
      audio.pause();
      URL.revokeObjectURL(url);
      audioRef.current = null;
      urlRef.current = null;
    };
  }, [blob]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
    } else {
      setPlaying(true); // synchronous feedback
      void audio.play().catch(() => setPlaying(false));
    }
  }

  return (
    <span className="player">
      <button
        type="button"
        className="play-btn"
        onClick={toggle}
        disabled={!blob}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        data-testid="play-button"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
    </span>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
