import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { countEntries } from "../lib/db";
import { StorageStatusBar } from "../components/StorageStatusBar";

// First-run home. The shell paints immediately with one obvious primary action.
// The entry count loads after paint and only changes the secondary lines.
export function Home() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void countEntries().then((n) => {
        if (alive) setCount(n);
      });
    };
    refresh();
    // The demo seed finishes after first paint; refresh when it signals.
    window.addEventListener("demo-seeded", refresh);
    return () => {
      alive = false;
      window.removeEventListener("demo-seeded", refresh);
    };
  }, []);

  const hasEntries = count !== null && count > 0;

  return (
    <div className="stack">
      <section className="stack" style={{ gap: 8 }}>
        <h1>Keep your family's words in their own voice</h1>
        <p>
          Sit with a grandparent and record the words, names, and sayings your
          family uses. They stay on this device for your family to keep.
        </p>
      </section>

      <Link
        to="/interview"
        className="btn btn--primary btn--block"
        data-testid="home-record"
      >
        Start recording
      </Link>

      {hasEntries ? (
        <>
          <Link
            to="/dictionary"
            className="btn btn--secondary btn--block"
            data-testid="home-dictionary"
          >
            Open the dictionary ({count})
          </Link>
          <Link
            to="/practice"
            className="btn btn--ghost btn--block"
            data-testid="home-practice"
          >
            Practice these words
          </Link>
          <Link
            to="/data"
            className="btn btn--ghost btn--block"
            data-testid="home-data"
          >
            Save a backup
          </Link>
        </>
      ) : (
        <p className="muted" data-testid="home-hint">
          Your first recording takes about a minute. Tap Start recording to begin.
        </p>
      )}

      <StorageStatusBar />
    </div>
  );
}
