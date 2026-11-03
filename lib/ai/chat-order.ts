/**
 * Timestamps that keep a transcript in array order when sorted by createdAt.
 * New user messages carry no createdAt, and the reply's createdAt is set when
 * streaming starts (before the save), so stored times alone can invert a
 * question and its answer. Each message gets max(its own time, previous + 1).
 */
export function orderedTimestamps(times: (number | undefined)[], now = Date.now()): number[] {
  const known = times.filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  let prev = (known.length ? Math.min(...known) : now) - times.length - 1;
  return times.map((t) => (prev = typeof t === "number" && Number.isFinite(t) && t > prev ? t : prev + 1));
}
