/**
 * Which outside apps use each bank account. Plaid has no API that lists other apps
 * connected to a user's bank (only the user can see that, in Plaid Portal or the bank's
 * own data-access page), so we infer apps from the account's transactions and link out
 * to the places that hold the full list.
 */

export interface AppPattern {
  id: string;
  name: string;
  kind: "payments" | "investing" | "credit" | "budgeting" | "banking" | "lending";
  re: RegExp;
}

/** Known money apps whose payments or transfers show up on a linked bank account. */
export const APP_PATTERNS: AppPattern[] = [
  { id: "paypal", name: "PayPal", kind: "payments", re: /\bPAYPAL\b|\bPYPL\b/i },
  { id: "venmo", name: "Venmo", kind: "payments", re: /\bVENMO\b/i },
  { id: "cashapp", name: "Cash App", kind: "payments", re: /\bCASH ?APP\b|\bSQUARE ?CASH\b/i },
  { id: "applecash", name: "Apple Cash", kind: "payments", re: /\bAPPLE CASH\b/i },
  { id: "googlepay", name: "Google Pay", kind: "payments", re: /\bGOOGLE ?PAY\b/i },
  { id: "wise", name: "Wise", kind: "payments", re: /\bTRANSFERWISE\b|\bWISE (INC|US|PAYMENTS)\b/i },
  { id: "remitly", name: "Remitly", kind: "payments", re: /\bREMITLY\b/i },
  { id: "creditkarma", name: "Credit Karma", kind: "credit", re: /\bCREDIT ?KARMA\b/i },
  { id: "rocketmoney", name: "Rocket Money", kind: "budgeting", re: /\bROCKET ?MONEY\b|\bTRUEBILL\b/i },
  { id: "ynab", name: "YNAB", kind: "budgeting", re: /\bYNAB\b|\bYOU NEED A BUDGET\b/i },
  { id: "monarch", name: "Monarch Money", kind: "budgeting", re: /\bMONARCH MONEY\b/i },
  { id: "robinhood", name: "Robinhood", kind: "investing", re: /\bROBINHOOD\b/i },
  { id: "coinbase", name: "Coinbase", kind: "investing", re: /\bCOINBASE\b/i },
  { id: "acorns", name: "Acorns", kind: "investing", re: /\bACORNS\b/i },
  { id: "stash", name: "Stash", kind: "investing", re: /\bSTASH (INVEST|CAPITAL|INC)\b/i },
  { id: "webull", name: "Webull", kind: "investing", re: /\bWEBULL\b/i },
  { id: "betterment", name: "Betterment", kind: "investing", re: /\bBETTERMENT\b/i },
  { id: "wealthfront", name: "Wealthfront", kind: "investing", re: /\bWEALTHFRONT\b/i },
  { id: "fidelity", name: "Fidelity", kind: "investing", re: /\bFIDELITY\b/i },
  { id: "schwab", name: "Charles Schwab", kind: "investing", re: /\bSCHWAB\b/i },
  { id: "vanguard", name: "Vanguard", kind: "investing", re: /\bVANGUARD\b/i },
  { id: "sofi", name: "SoFi", kind: "banking", re: /\bSOFI\b/i },
  { id: "chime", name: "Chime", kind: "banking", re: /\bCHIME\b/i },
  { id: "earnin", name: "EarnIn", kind: "lending", re: /\bEARNIN\b/i },
  { id: "brigit", name: "Brigit", kind: "lending", re: /\bBRIGIT\b/i },
  { id: "affirm", name: "Affirm", kind: "lending", re: /\bAFFIRM\b/i },
  { id: "klarna", name: "Klarna", kind: "lending", re: /\bKLARNA\b/i },
  { id: "afterpay", name: "Afterpay", kind: "lending", re: /\bAFTERPAY\b/i },
];

/** One regex for the DB query, so only candidate transactions are read. */
export const APP_QUERY_SOURCE = APP_PATTERNS.map((p) => p.re.source).join("|");

export function matchApp(text: string): AppPattern | undefined {
  return APP_PATTERNS.find((p) => p.re.test(text));
}

export interface SeenApp {
  id: string;
  name: string;
  kind: AppPattern["kind"];
  count: number;
  lastSeen: Date;
}

type Txn = { accountId?: string; name: string; merchant?: string; date: Date };

/** Groups transactions by account and app: `{ accountId: SeenApp[] }`, newest app first. */
export function detectApps(txns: Txn[]): Record<string, SeenApp[]> {
  const out: Record<string, Map<string, SeenApp>> = {};
  for (const t of txns) {
    if (!t.accountId) continue;
    const app = matchApp(`${t.merchant ?? ""} ${t.name}`);
    if (!app) continue;
    const m = (out[t.accountId] ??= new Map());
    const seen = m.get(app.id);
    if (seen) {
      seen.count++;
      if (t.date > seen.lastSeen) seen.lastSeen = t.date;
    } else m.set(app.id, { id: app.id, name: app.name, kind: app.kind, count: 1, lastSeen: t.date });
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, m]) => [k, [...m.values()].sort((a, b) => +b.lastSeen - +a.lastSeen)]),
  );
}

/** Plaid Portal: the user can see and disconnect every app they linked through Plaid. */
export const PLAID_PORTAL_URL = "https://my.plaid.com";

export interface BankAccessGuide {
  url: string;
  where: string;
}

const BANK_GUIDES: [RegExp, BankAccessGuide][] = [
  [/chase/i, { url: "https://www.chase.com", where: "Profile & settings, then Security center, then Linked apps & websites" }],
  [/bank of america/i, { url: "https://www.bankofamerica.com", where: "Menu, then Security Center, then Connected Apps & Websites" }],
  [/wells fargo/i, { url: "https://www.wellsfargo.com", where: "Control Tower, then Connected apps & websites" }],
  [/capital one/i, { url: "https://www.capitalone.com", where: "Profile, then Security, then Connected Apps" }],
  [/\bciti(bank)?\b/i, { url: "https://www.citi.com", where: "Profile, then Security center, then Linked apps & websites" }],
  [/u\.?s\.? bank/i, { url: "https://www.usbank.com", where: "Profile, then Security, then Connected apps" }],
  [/american express|amex/i, { url: "https://www.americanexpress.com", where: "Account services, then Connected apps & sites" }],
];

const GENERIC: BankAccessGuide = { url: "", where: "Security or Privacy settings, under Connected apps, Linked apps or Third-party access" };

/** Where in the bank's own site the user can review every app with access. */
export function bankAccessGuide(institutionName: string): BankAccessGuide {
  return BANK_GUIDES.find(([re]) => re.test(institutionName))?.[1] ?? GENERIC;
}
