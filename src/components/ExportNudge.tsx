import { useState } from "react";
import { downloadArchive } from "../lib/archive";

type Phase = "idle" | "working" | "saved" | "error";

// Post-session nudge: one tap saves the backup right here. Dismissal is
// component state only, so the nudge returns after the next session.
export function ExportNudge() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function handleSave() {
    if (phase === "working") return;
    setPhase("working");
    try {
      await downloadArchive();
      setPhase("saved");
    } catch {
      setPhase("error");
    }
  }

  return (
    <div className="card stack" style={{ gap: 10 }} data-testid="export-nudge">
      {phase === "saved" ? (
        <p style={{ margin: 0 }} role="status" data-testid="nudge-saved">
          Backup saved. Keep the file somewhere safe.
        </p>
      ) : (
        <>
          <h2 style={{ margin: 0 }}>Keep today's words safe.</h2>
          {phase === "error" ? (
            <p style={{ margin: 0 }} role="alert">
              The backup did not save. Try again.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={handleSave}
            disabled={phase === "working"}
            data-testid="nudge-export"
          >
            {phase === "working" ? "Preparing your file…" : "Save a backup"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setDismissed(true)}
            data-testid="nudge-dismiss"
          >
            Not now
          </button>
        </>
      )}
    </div>
  );
}
