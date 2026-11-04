/** Account display + lookup helpers (client-safe). A nickname is the user's own name; the bank's name always stays visible beside it. */
export interface AccountLike {
  _id: string;
  name: string;
  nickname?: string | null;
  officialName?: string | null;
  mask?: string | null;
  archivedAt?: Date | string | null;
}

/** What the user calls it: nickname, else the bank's name. */
export const accountTitle = (a: Pick<AccountLike, "name" | "nickname">) => a.nickname?.trim() || a.name;

/** The bank's name and mask, shown under/after a nickname: "Everyday Checking •••0001". */
export const accountDetail = (a: Pick<AccountLike, "name" | "nickname" | "mask">) =>
  [a.nickname?.trim() ? a.name : null, a.mask ? `•••${a.mask}` : null].filter(Boolean).join(" ");

/** One-line label: "Joint (Everyday Checking •••0001)", "Rewards Card •••4242", plus " (archived)". */
export function accountLabel(a: Omit<AccountLike, "_id">, opts: { archived?: boolean } = { archived: true }) {
  const detail = accountDetail(a);
  const base = a.nickname?.trim() ? `${accountTitle(a)}${detail ? ` (${detail})` : ""}` : `${a.name}${a.mask ? ` •••${a.mask}` : ""}`;
  return `${base}${opts.archived && a.archivedAt ? " (archived)" : ""}`;
}

/** Words a picker search matches against. */
export const accountKeywords = (a: Omit<AccountLike, "_id">) =>
  [a.nickname, a.name, a.officialName, a.mask, a.mask ? `•••${a.mask}` : null].filter((x): x is string => !!x?.trim());

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Resolves account references (id, nickname, name, official name or last digits) to ids.
 * Exact matches win; otherwise a reference matches every account whose nickname or name contains it.
 */
export function matchAccounts(accounts: AccountLike[], refs: string[]) {
  const ids = new Set<string>();
  const unmatched: string[] = [];
  for (const raw of refs) {
    const r = norm(raw);
    if (!r) continue;
    const digits = r.replace(/\D/g, "");
    const exact = accounts.filter(
      (a) => a._id === raw.trim() || [a.nickname, a.name, a.officialName].some((n) => n && norm(n) === r) || (/^\D{0,4}\d{2,}$/.test(r) && a.mask === digits),
    );
    const hits = exact.length ? exact : accounts.filter((a) => [a.nickname, a.name, a.officialName].some((n) => n && norm(n).includes(r)));
    if (!hits.length) unmatched.push(raw);
    for (const a of hits) ids.add(a._id);
  }
  return { ids: [...ids], unmatched };
}
