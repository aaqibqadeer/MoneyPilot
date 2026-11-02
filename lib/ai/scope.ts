/**
 * Chat scope guard (CLAUDE.md §6). The assistant may only use tools that read or propose
 * changes to the signed-in user's own MoneyPilot data. No web search, fetch or other
 * external tools: anything not listed here is rejected before the model sees it.
 */
export const ALLOWED_CHAT_TOOLS = [
  "getAccounts",
  "getTags",
  "searchTransactions",
  "getSpendingSummary",
  "getBills",
  "getLiabilities",
  "getConnectedApps",
  "getClaims",
  "getDocuments",
  "runAnalyticsQuery",
  "proposeChanges",
] as const;

const allowed = new Set<string>(ALLOWED_CHAT_TOOLS);

/** Returns the tool set unchanged, or throws if it holds a tool outside the app-data allowlist. */
export function scopedTools<T extends Record<string, unknown>>(tools: T): T {
  const extra = Object.keys(tools).filter((name) => !allowed.has(name));
  if (extra.length) throw new Error(`Chat tools outside app scope: ${extra.join(", ")}`);
  return tools;
}

/** Reply used when a question is outside MoneyPilot's scope. Kept in one place for the prompt and tests. */
export const OUT_OF_SCOPE_REPLY =
  "I can only help with MoneyPilot: your accounts, transactions, spending, bills, tags, claims and how to use the app.";
