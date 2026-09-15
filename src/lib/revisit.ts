// Spaced-revisit schedule: fixed, expanding, deterministic intervals. This is
// the only place interval math lives; db.ts calls it. No randomness and no
// Date read inside the function (the caller passes `now`) so it is pure and
// its tests are stable.

const DAY_MS = 24 * 60 * 60 * 1000;

// Fixed, expanding intervals in days. Banned randomness keeps the schedule
// deterministic.
export const INTERVAL_DAYS = [1, 3, 7, 14, 30];

export interface NextRevisit {
  intervalIndex: number;
  dueAt: number;
}

// Given the entry's current intervalIndex and the moment a record-back was
// completed, return the next {intervalIndex, dueAt}. The step size is capped at
// the last interval, so an entry keeps recurring at the widest spacing.
export function nextRevisit(intervalIndex: number, now: number): NextRevisit {
  const step = INTERVAL_DAYS[Math.min(intervalIndex, INTERVAL_DAYS.length - 1)];
  return { intervalIndex: intervalIndex + 1, dueAt: now + step * DAY_MS };
}
