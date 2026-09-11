import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listEntries, type Entry } from "../lib/db";
import { LazyEntryPlayer } from "../components/LazyEntryPlayer";
import { EmptyState } from "../components/states/EmptyState";
import { LoadingSkeleton } from "../components/states/LoadingSkeleton";

// The talking dictionary: saved entries newest first, each with a play control.
export function Dictionary() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listEntries().then((rows) => {
      if (alive) setEntries(rows);
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
        <Link to="/new" className="btn btn--primary">
          Record
        </Link>
      </div>

      {entries === null ? (
        <LoadingSkeleton rows={4} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="Record your first word"
          body="Sit with a grandparent and capture one word in their voice. It shows up here to play back."
          action={
            <Link to="/new" className="btn btn--primary">
              Record a word
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
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
