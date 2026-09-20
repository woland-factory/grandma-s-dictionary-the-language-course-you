import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { countAttempts, countEntries, getMeta, setMeta } from "../lib/db";

interface StepState {
  recorded: boolean;
  saidBack: boolean;
  playedBoth: boolean;
}

// The self-ticking first-run checklist. It walks a brand-new user from opening
// the app to the two-voice moment in three steps, each tied to a real control
// that already exists. It reads live state so the steps tick themselves off,
// refreshes on the demo-seed and two-voice events, appears only until the first
// success, and never renders again once firstRunComplete is set (a returning
// user never sees it). While the completion flag is still loading it renders
// nothing, so there is no flash or layout jump.
export function FirstRunGuide() {
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(false); // firstRunComplete
  const [steps, setSteps] = useState<StepState>({
    recorded: false,
    saidBack: false,
    playedBoth: false,
  });

  useEffect(() => {
    let alive = true;
    async function refresh() {
      const complete = await getMeta<boolean>("firstRunComplete");
      if (complete) {
        if (alive) {
          setDone(true);
          setLoaded(true);
        }
        return;
      }
      const [entries, attempts, playedBoth] = await Promise.all([
        countEntries(),
        countAttempts(),
        getMeta<boolean>("twoVoicePlayed"),
      ]);
      if (!alive) return;
      setSteps({
        recorded: entries > 0,
        saidBack: attempts > 0,
        playedBoth: !!playedBoth,
      });
      setLoaded(true);
    }
    void refresh();
    // Same event pattern Home uses: the demo seed and the two-voice moment both
    // finish after first paint, so refresh when they signal.
    window.addEventListener("demo-seeded", refresh);
    window.addEventListener("two-voice-played", refresh);
    return () => {
      alive = false;
      window.removeEventListener("demo-seeded", refresh);
      window.removeEventListener("two-voice-played", refresh);
    };
  }, []);

  const allDone = steps.recorded && steps.saidBack && steps.playedBoth;

  // When every step is done, complete the first run and hide the guide for good.
  useEffect(() => {
    if (loaded && !done && allDone) {
      setDone(true);
      void setMeta("firstRunComplete", true);
    }
  }, [loaded, done, allDone]);

  function skip() {
    setDone(true);
    void setMeta("firstRunComplete", true);
  }

  if (!loaded || done) return null;

  const items = [
    {
      key: "recorded",
      label: "Record a word in their voice.",
      to: "/interview",
      done: steps.recorded,
    },
    {
      key: "saidBack",
      label: "Say it back.",
      to: "/dictionary",
      done: steps.saidBack,
    },
    {
      key: "playedBoth",
      label: "Play both voices.",
      to: "/dictionary",
      done: steps.playedBoth,
    },
  ];
  const nextIndex = items.findIndex((step) => !step.done);

  return (
    <section className="card stack first-run" style={{ gap: 12 }} data-testid="first-run">
      <h2 className="first-run__title">Your first word in three steps</h2>
      <ol className="first-run__steps">
        {items.map((step, i) => {
          if (step.done) {
            return (
              <li
                key={step.key}
                className="first-run__step first-run__step--done"
                data-testid={`first-run-step-${step.key}`}
              >
                <span className="first-run__check" aria-hidden="true">
                  ✓
                </span>
                <span>{step.label}</span>
              </li>
            );
          }
          if (i === nextIndex) {
            return (
              <li key={step.key} className="first-run__step">
                <Link
                  to={step.to}
                  className="btn btn--secondary btn--block"
                  data-testid="first-run-next"
                >
                  {step.label}
                </Link>
              </li>
            );
          }
          return (
            <li
              key={step.key}
              className="first-run__step first-run__step--todo muted"
              data-testid={`first-run-step-${step.key}`}
            >
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={skip}
        data-testid="first-run-skip"
      >
        Skip
      </button>
    </section>
  );
}
