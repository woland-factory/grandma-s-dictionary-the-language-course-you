import { useEffect, useRef, useState } from "react";

interface TwoVoicePlayerProps {
  elderBlob: Blob | null;
  attemptBlob: Blob | null;
}

type Voice = "idle" | "elder" | "attempt";

// The signature moment: one tap plays the elder saying the word, then the most
// recent child attempt, in sequence. With no attempt it plays only the elder.
// Object URLs are created when the blobs arrive and revoked on cleanup, like
// AudioPlayer, so nothing leaks. Pressed feedback flips synchronously on tap,
// before any audio starts.
export function TwoVoicePlayer({ elderBlob, attemptBlob }: TwoVoicePlayerProps) {
  const elderRef = useRef<HTMLAudioElement | null>(null);
  const attemptRef = useRef<HTMLAudioElement | null>(null);
  const [voice, setVoice] = useState<Voice>("idle");

  useEffect(() => {
    let elderUrl: string | null = null;
    let attemptUrl: string | null = null;
    if (elderBlob) {
      elderUrl = URL.createObjectURL(elderBlob);
      elderRef.current = new Audio(elderUrl);
    }
    if (attemptBlob) {
      attemptUrl = URL.createObjectURL(attemptBlob);
      attemptRef.current = new Audio(attemptUrl);
    }
    return () => {
      elderRef.current?.pause();
      attemptRef.current?.pause();
      if (elderUrl) URL.revokeObjectURL(elderUrl);
      if (attemptUrl) URL.revokeObjectURL(attemptUrl);
      elderRef.current = null;
      attemptRef.current = null;
    };
  }, [elderBlob, attemptBlob]);

  function stopAll() {
    for (const audio of [elderRef.current, attemptRef.current]) {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
    setVoice("idle");
  }

  function playAttempt() {
    const attempt = attemptRef.current;
    if (!attempt) {
      setVoice("idle");
      return;
    }
    setVoice("attempt");
    const onEnd = () => {
      attempt.removeEventListener("ended", onEnd);
      setVoice("idle");
    };
    attempt.addEventListener("ended", onEnd);
    attempt.currentTime = 0;
    void attempt.play().catch(() => setVoice("idle"));
  }

  function play() {
    if (voice !== "idle") {
      stopAll();
      return;
    }
    const elder = elderRef.current;
    if (!elder) return;
    setVoice("elder"); // synchronous feedback, before any audio starts
    const onEnd = () => {
      elder.removeEventListener("ended", onEnd);
      playAttempt();
    };
    elder.addEventListener("ended", onEnd);
    elder.currentTime = 0;
    void elder.play().catch(() => {
      elder.removeEventListener("ended", onEnd);
      setVoice("idle");
    });
  }

  const hasAttempt = !!attemptBlob;
  const playing = voice !== "idle";
  const label = playing
    ? "Stop"
    : hasAttempt
      ? "Play both voices"
      : "Play in their voice";
  const indicator =
    voice === "elder"
      ? "In their voice"
      : voice === "attempt"
        ? "Saying it back"
        : hasAttempt
          ? "Their voice, then the little one saying it back"
          : "Their voice";

  return (
    <div className="two-voice">
      <button
        type="button"
        className="btn btn--primary btn--block two-voice__play"
        onClick={play}
        disabled={!elderBlob}
        aria-pressed={playing}
        data-testid="two-voice-play"
        data-voice={voice}
      >
        <span className="two-voice__icon" aria-hidden="true">
          {playing ? "◼" : "▶"}
        </span>
        {label}
      </button>
      <p className="two-voice__indicator" data-testid="two-voice-indicator">
        {indicator}
      </p>
    </div>
  );
}
