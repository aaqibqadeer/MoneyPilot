/** CSV/XLSX statement parsing (CLAUDE.md §8). Pure, so it is unit-tested without files. */

export type Cell = string | number | boolean | Date | null;
export interface Mapping {
  date: number;
  description: number;
  /** One signed amount column… */
  amount?: number;
  /** …or separate money-out / money-in columns. */
  debit?: number;
  credit?: number;
  /** Bank exports usually show spend as negative; flip so positive = money out (Plaid convention). */
  invert: boolean;
}
export interface ParsedTxn {
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number; // positive = money out
}

/** RFC 4180-ish: quotes, escaped quotes, commas/semicolons/tabs, CRLF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const H = {
  date: /^(transaction |posted |posting |trans\.? )?date$|^date posted$|^posted$/i,
  description: /description|payee|merchant|details|narrative|memo|name/i,
  amount: /^(transaction )?amount( \(.*\))?$|^value$/i,
  debit: /debit|withdrawal|money out|paid out|charge/i,
  credit: /credit|deposit|money in|paid in/i,
};

/** Finds the header row (first 10 rows) and which column is which. Null if it doesn't look like a statement. */
export function detectMapping(rows: Cell[][]): { headerRow: number; mapping: Mapping } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const h = rows[r].map((c) => String(c ?? "").trim());
    const find = (rx: RegExp, skip: number[] = []) => h.findIndex((x, i) => !skip.includes(i) && rx.test(x));
    const date = find(H.date) >= 0 ? find(H.date) : find(/date/i);
    if (date < 0) continue;
    const description = find(H.description, [date]);
    const amount = find(H.amount, [date, description]);
    const debit = find(H.debit, [date, description]);
    const credit = find(H.credit, [date, description, debit]);
    if (description < 0 || (amount < 0 && (debit < 0 || credit < 0))) continue;
    const mapping: Mapping = { date, description, invert: true };
    if (amount >= 0) mapping.amount = amount;
    else Object.assign(mapping, { debit, credit });
    // Credit-card exports often list purchases as positive; if most amounts are positive, keep the sign.
    if (amount >= 0) {
      const vals = rows.slice(r + 1, r + 51).map((x) => toCents(x[amount])).filter((v): v is number => v !== null && v !== 0);
      mapping.invert = vals.filter((v) => v < 0).length >= vals.length / 2;
    }
    return { headerRow: r, mapping };
  }
  return null;
}

/** "$1,234.56", "(12.00)", "-12", 12.5 → cents. */
export function toCents(v: Cell): number | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean" || v instanceof Date) return null;
  if (typeof v === "number") return Math.round(v * 100);
  let s = v.trim().replace(/[$€£\s]/g, "");
  const neg = /^\(.*\)$/.test(s) || s.endsWith("-") || s.startsWith("-");
  s = s.replace(/[()\-+]/g, "");
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56 or 45,00
  s = s.replace(/,/g, "");
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const c = Math.round(parseFloat(s) * 100);
  return neg ? -c : c;
}

/** Date cell → YYYY-MM-DD. Accepts ISO, M/D/Y (US first), D.M.Y, and Excel Dates. */
export function toIsoDate(v: Cell): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return iso(year(+m[3]), +m[1], +m[2]) ?? iso(year(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) return iso(year(+m[3]), +m[2], +m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
const year = (y: number) => (y < 100 ? 2000 + y : y);
function iso(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function rowsToTxns(rows: Cell[][], headerRow: number, m: Mapping): { txns: ParsedTxn[]; skipped: number } {
  const txns: ParsedTxn[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerRow + 1)) {
    const date = toIsoDate(r[m.date]);
    const description = String(r[m.description] ?? "").trim().slice(0, 200);
    let cents: number | null;
    if (m.amount !== undefined) {
      const a = toCents(r[m.amount]);
      cents = a === null ? null : m.invert ? -a : a;
    } else {
      const out = toCents(r[m.debit!]);
      const inn = toCents(r[m.credit!]);
      cents = out === null && inn === null ? null : Math.abs(out ?? 0) - Math.abs(inn ?? 0);
    }
    if (!date || !description || cents === null || cents === 0) {
      skipped++;
      continue;
    }
    txns.push({ date, description, amountCents: cents });
  }
  return { txns, skipped };
}
