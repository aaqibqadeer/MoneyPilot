export function money(cents: number | undefined | null, currency = "USD", opts: { sign?: boolean } = {}) {
  if (cents === undefined || cents === null) return "—";
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(cents) / 100);
  if (opts.sign) return cents < 0 ? `+${s}` : `−${s}`;
  return cents < 0 ? `−${s}` : s;
}

export function shortDate(d: Date | string | undefined, tz?: string) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz ?? "UTC" }).format(new Date(d));
}

export function relative(d: Date | string | undefined) {
  if (!d) return "never";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Human label for Plaid's ENUM_STYLE categories. */
export const categoryLabel = (c?: string) =>
  c ? c.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "Uncategorized";
