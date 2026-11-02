/** Recurring charge detection (CLAUDE.md §11 Phase 4). Pure: give it live spend transactions, get candidate bills. */

export type Recurrence = "weekly" | "monthly" | "yearly";
export interface RecurringTxn {
  key: string;
  label: string;
  date: Date;
  amountCents: number;
  accountId?: string;
}
export interface RecurringCandidate {
  key: string;
  name: string;
  recurrence: Recurrence;
  amountCents: number;
  count: number;
  lastDate: Date;
  nextDate: Date;
  /** Account of the latest charge. */
  accountId?: string;
}

const DAY = 86400000;
const PERIODS: [Recurrence, number, number, number][] = [
  // kind, nominal days, min, max
  ["weekly", 7, 5, 9],
  ["monthly", 30, 26, 35],
  ["yearly", 365, 350, 380],
];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Lowercased merchant key without digits, store numbers or punctuation. */
export const merchantKey = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

function addPeriod(d: Date, r: Recurrence) {
  const n = new Date(d);
  if (r === "weekly") n.setUTCDate(n.getUTCDate() + 7);
  if (r === "monthly") n.setUTCMonth(n.getUTCMonth() + 1);
  if (r === "yearly") n.setUTCFullYear(n.getUTCFullYear() + 1);
  return n;
}
export { addPeriod as nextDue };

/**
 * A merchant is recurring when it has ≥3 charges (≥2 for yearly), the gaps
 * match one period, amounts stay within 20% of the median, and the latest
 * charge is recent enough that the next one is still expected.
 */
export function detectRecurring(txns: RecurringTxn[], now = new Date()): RecurringCandidate[] {
  const groups = new Map<string, RecurringTxn[]>();
  for (const t of txns) if (t.amountCents > 0 && t.key) groups.set(t.key, [...(groups.get(t.key) ?? []), t]);
  const out: RecurringCandidate[] = [];
  for (const [key, list] of groups) {
    const rows = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());
    if (rows.length < 2) continue;
    const gaps = rows.slice(1).map((r, i) => (r.date.getTime() - rows[i].date.getTime()) / DAY);
    const gap = median(gaps);
    const period = PERIODS.find(([, , min, max]) => gap >= min && gap <= max);
    if (!period) continue;
    const [recurrence, nominal, min, max] = period;
    if (rows.length < (recurrence === "yearly" ? 2 : 3)) continue;
    if (gaps.filter((g) => g >= min && g <= max).length < gaps.length * 0.75) continue;
    const amount = median(rows.map((r) => r.amountCents));
    if (rows.some((r) => Math.abs(r.amountCents - amount) > amount * 0.2)) continue;
    const last = rows[rows.length - 1];
    if (now.getTime() - last.date.getTime() > nominal * 1.5 * DAY) continue;
    out.push({ key, name: last.label, recurrence, amountCents: amount, count: rows.length, lastDate: last.date, nextDate: addPeriod(last.date, recurrence), accountId: last.accountId });
  }
  return out.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
}
