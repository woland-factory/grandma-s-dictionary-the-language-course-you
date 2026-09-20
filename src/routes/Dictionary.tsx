import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listEntries, type Entry } from "../lib/db";
import { categoryLabel } from "../data/deck";
import { LazyEntryPlayer } from "../components/LazyEntryPlayer";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingSkeleton } from "../components/states/LoadingSkeleton";

// The talking dictionary: saved entries newest first, each with a play control.
export function Dictionary() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    listEntries()
      .then((rows) => {
        if (alive) setEntries(rows);
      })
      .catch(() => {
        // The read rejected. Show a way out instead of an endless skeleton.
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="stack">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0 }}>Your dictionary</h1>
        <Link to="/interview" className="btn btn--primary">
          Record
        </Link>
      </div>

      {failed ? (
        <ErrorState
          icon="📖"
          title="Reload to see your words"
          body="Reload the page to try again. Your saved words stay on this device."
          action={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
              data-testid="load-error-reload"
            >
              Reload
            </button>
          }
        />
      ) : entries === null ? (
        <LoadingSkeleton rows={4} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="Record your first word"
          body="Sit with a grandparent and capture one word in their voice. It shows up here to play back."
          action={
            <Link to="/interview" className="btn btn--primary">
              Start recording
            </Link>
          }
        />
      ) : (
        <ul className="entry-list">
          {entries.map((entry) => (
            <li key={entry.id} className="entry-item">
              <LazyEntryPlayer entry={entry} />
              <div className="entry-item__body">
                <Link to={`/entry/${entry.id}`} className="entry-item__link">
                  <p className="entry-item__word">
                    {entry.writtenForm || entry.meaning}
                  </p>
                  {entry.writtenForm ? (
                    <p className="entry-item__meaning">{entry.meaning}</p>
                  ) : null}
                  {entry.category && entry.category !== "uncategorized" ? (
                    <span className="entry-item__tag">
                      {categoryLabel(entry.category)}
                    </span>
                  ) : null}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
