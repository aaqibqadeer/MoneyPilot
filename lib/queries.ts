import "server-only";
import { repos } from "@/lib/db/repos";
import { detectRecurring, merchantKey } from "@/lib/bills/recurring";
import { APP_QUERY_SOURCE, bankAccessGuide, detectApps } from "@/lib/bank/connected-apps";

/** Server-side data for pages. All aggregation runs in MongoDB (or mingo in demo mode). */

export async function accountsOverview(userId: string) {
  const db = repos(userId);
  const [items, accounts, liabilities, appTxns] = await Promise.all([
    db.items.find({}, { sort: { archivedAt: 1, createdAt: 1 } }),
    db.accounts.find({}, { sort: { name: 1 } }),
    db.liabilities.find({}),
    appTransactions(userId),
  ]);
  const apps = detectApps(appTxns);
  return items.map((i) => ({
    _id: i._id,
    institutionName: i.institutionName,
    status: i.status,
    archivedAt: i.archivedAt,
    error: i.error,
    lastSyncedAt: i.lastSyncedAt,
    access: bankAccessGuide(i.institutionName),
    accounts: accounts
      .filter((a) => a.itemId === i._id)
      .map((a) => ({ ...a, liability: liabilities.find((l) => l.accountId === a._id), apps: apps[a._id] ?? [] })),
  }));
}

/** Only transactions whose name/merchant mentions a known money app (see lib/bank/connected-apps.ts). */
export function appTransactions(userId: string) {
  const re = { $regex: APP_QUERY_SOURCE, $options: "i" };
  return repos(userId).transactions.find(
    { deletedAt: { $exists: false }, $or: [{ name: re }, { merchant: re }] },
    { projection: { accountId: 1, name: 1, merchant: 1, date: 1 }, sort: { date: -1 }, limit: 2000 },
  );
}

export interface TxnQuery {
  q?: string;
  accountId?: string;
  /** Tag id, or "none" for untagged. */
  tagId?: string;
  page?: number;
  pageSize?: number;
}

export async function listTransactions(userId: string, { q, accountId, tagId, page = 1, pageSize = 50 }: TxnQuery) {
  const db = repos(userId);
  const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
  if (accountId) filter.accountId = accountId;
  if (tagId) filter.tagIds = tagId === "none" ? { $size: 0 } : tagId;
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ name: rx }, { merchant: rx }, { description: rx }, { notes: rx }];
  }
  const [rows, total, accounts, tags] = await Promise.all([
    db.transactions.find(filter, { sort: { date: -1, _id: 1 }, skip: (page - 1) * pageSize, limit: pageSize, projection: { raw: 0 } }),
    db.transactions.count(filter),
    db.accounts.find({}),
    db.tags.find({}),
  ]);
  return { rows, total, page, pageSize, accounts, tags };
}

const monthStart = (d: Date, offset = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));

export async function dashboardSummary(userId: string) {
  const db = repos(userId);
  const now = new Date();
  const thisMonth = monthStart(now);
  const lastMonth = monthStart(now, -1);
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const [balances, spend, topTags, upcoming, recent, items] = await Promise.all([
    db.accounts.aggregate<{ _id: string; total: number; limit: number }>([
      { $match: { archivedAt: { $exists: false } } },
      { $group: { _id: "$type", total: { $sum: { $ifNull: ["$currentCents", 0] } }, limit: { $sum: { $ifNull: ["$limitCents", 0] } } } },
    ]),
    db.transactions.aggregate<{ _id: string; total: number }>([
      { $match: { deletedAt: { $exists: false }, amountCents: { $gt: 0 }, date: { $gte: lastMonth }, category: { $nin: ["TRANSFER_OUT", "LOAN_PAYMENTS"] } } },
      { $group: { _id: { $cond: [{ $gte: ["$date", thisMonth] }, "this", "last"] }, total: { $sum: "$amountCents" } } },
    ]),
    db.transactions.aggregate<{ _id: string; total: number; name: string; color: string }>([
      { $match: { deletedAt: { $exists: false }, amountCents: { $gt: 0 }, date: { $gte: thisMonth } } },
      { $unwind: "$tagIds" },
      { $group: { _id: "$tagIds", total: { $sum: "$amountCents" } } },
      { $sort: { total: -1 } },
      { $limit: 6 },
    ]),
    db.bills.find({ status: { $ne: "paid" }, dueDate: { $gte: new Date(now.getTime() - 86400000), $lte: in30 } }, { sort: { dueDate: 1 }, limit: 6 }),
    db.transactions.find({ deletedAt: { $exists: false } }, { sort: { date: -1 }, limit: 6, projection: { raw: 0 } }),
    db.items.find({ status: { $ne: "archived" } }, { sort: { lastSyncedAt: -1 } }),
  ]);
  const tags = await db.tags.find({ _id: { $in: topTags.map((t) => t._id) } });
  const dep = balances.find((b) => b._id === "depository");
  const credit = balances.find((b) => b._id === "credit");
  return {
    cashCents: dep?.total ?? 0,
    cardBalanceCents: credit?.total ?? 0,
    cardLimitCents: credit?.limit ?? 0,
    spendThisMonth: spend.find((s) => s._id === "this")?.total ?? 0,
    spendLastMonth: spend.find((s) => s._id === "last")?.total ?? 0,
    topTags: topTags.map((t) => {
      const tag = tags.find((x) => x._id === t._id);
      return { name: tag?.name ?? "Other", color: tag?.color ?? "#94a3b8", total: t.total };
    }),
    upcoming,
    recent,
    lastSyncedAt: items[0]?.lastSyncedAt,
    hasItems: items.length > 0,
  };
}

/** Tags with how many live transactions use each, plus the rules. */
export async function tagsOverview(userId: string) {
  const db = repos(userId);
  const [tags, counts, rules, untagged] = await Promise.all([
    db.tags.find({}, { sort: { name: 1 } }),
    db.transactions.aggregate<{ _id: string; n: number }>([
      { $match: { deletedAt: { $exists: false } } },
      { $unwind: "$tagIds" },
      { $group: { _id: "$tagIds", n: { $sum: 1 } } },
    ]),
    db.tagRules.find({}, { sort: { createdAt: 1 } }),
    db.transactions.count({ deletedAt: { $exists: false }, tagIds: { $size: 0 } }),
  ]);
  const n = new Map(counts.map((c) => [c._id, c.n]));
  return { tags: tags.map((t) => ({ ...t, count: n.get(t._id) ?? 0 })), rules, untagged };
}

/** Recent changeSets for Settings → History (ops omitted, only their count). */
export async function changeHistory(userId: string, limit = 50) {
  const rows = await repos(userId).changeSets.aggregate<{ _id: string; summary: string; origin: string; status: string; createdAt: Date; appliedAt?: Date; revertedAt?: Date; opCount: number }>([
    { $match: { status: { $ne: "rejected" } } },
    { $sort: { createdAt: -1 } },
    { $limit: limit },
    { $project: { summary: 1, origin: 1, status: 1, createdAt: 1, appliedAt: 1, revertedAt: 1, opCount: { $size: "$ops" } } },
  ]);
  return rows;
}

/** Settings → Security: passkeys, live sessions and recovery code count. */
export async function securityOverview(userId: string, currentHash: string | null) {
  const db = repos(userId);
  const [passkeys, sessions, total, left] = await Promise.all([
    db.passkeys.find({}, { sort: { createdAt: 1 }, projection: { publicKey: 0 } }),
    db.sessions.find({ expiresAt: { $gt: new Date() } }, { sort: { lastSeenAt: -1 }, limit: 20 }),
    db.recoveryCodes.count({}),
    db.recoveryCodes.count({ usedAt: { $exists: false } }),
  ]);
  return {
    passkeys: passkeys.map((p) => ({ _id: p._id, name: p.name, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() })),
    sessions: sessions.map((s) => ({ _id: s._id, userAgent: s.userAgent, lastSeenAt: s.lastSeenAt.toISOString(), current: s.tokenHash === currentHash })),
    recovery: { total, left },
  };
}

/** Bills page: every bill from 60 days back, plus recurring charges not tracked yet. */
export async function billsOverview(userId: string) {
  const db = repos(userId);
  const now = new Date();
  const [bills, txns, accounts] = await Promise.all([
    db.bills.find({ dueDate: { $gte: new Date(now.getTime() - 60 * 86400000) } }, { sort: { dueDate: 1 }, limit: 300 }),
    db.transactions.find(
      { deletedAt: { $exists: false }, pending: false, amountCents: { $gt: 0 }, date: { $gte: new Date(now.getTime() - 400 * 86400000) }, category: { $nin: ["TRANSFER_OUT", "LOAN_PAYMENTS"] } },
      { projection: { name: 1, merchant: 1, description: 1, date: 1, amountCents: 1, accountId: 1 }, limit: 5000 },
    ),
    db.accounts.find({}, { projection: { name: 1, mask: 1, archivedAt: 1 } }),
  ]);
  /** "Rewards Card •••4242", plus "(archived)" for a removed bank's account. */
  const accountNames = Object.fromEntries(accounts.map((a) => [a._id, `${a.name}${a.mask ? ` •••${a.mask}` : ""}${a.archivedAt ? " (archived)" : ""}`]));
  const tracked = new Set(bills.map((b) => merchantKey(b.name)));
  const recurring = detectRecurring(
    txns.map((t) => {
      const label = t.description ?? t.merchant ?? t.name;
      return { key: merchantKey(t.merchant ?? t.name), label, date: t.date, amountCents: t.amountCents, accountId: t.accountId };
    }),
    now,
  ).filter((c) => !tracked.has(c.key) && !tracked.has(merchantKey(c.name)));
  return { bills, recurring, accountNames };
}

/** Claims not yet settled, for the dashboard card. */
export async function openClaims(userId: string) {
  const [r] = await repos(userId).claims.aggregate<{ n: number; claimed: number }>([
    { $match: { status: { $in: ["draft", "submitted", "in_review", "approved"] } } },
    { $group: { _id: null, n: { $sum: 1 }, claimed: { $sum: { $ifNull: ["$claimedCents", 0] } } } },
  ]);
  return { count: r?.n ?? 0, claimedCents: r?.claimed ?? 0 };
}

export async function listDocuments(userId: string) {
  return repos(userId).documents.find({}, { sort: { createdAt: -1 }, limit: 100, projection: { extracted: 0 } });
}

export async function listClaims(userId: string) {
  return repos(userId).claims.find({}, { sort: { updatedAt: -1 }, limit: 200 });
}

/** Chat token usage, this month and all time. */
export async function aiUsage(userId: string) {
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [r] = await repos(userId).chatMessages.aggregate<{ month: { tokens: number; replies: number }[]; all: { tokens: number; replies: number }[] }>([
    { $match: { role: "assistant" } },
    {
      $facet: {
        month: [{ $match: { createdAt: { $gte: since } } }, { $group: { _id: null, tokens: { $sum: { $ifNull: ["$usage.totalTokens", 0] } }, replies: { $sum: 1 } } }],
        all: [{ $group: { _id: null, tokens: { $sum: { $ifNull: ["$usage.totalTokens", 0] } }, replies: { $sum: 1 } } }],
      },
    },
  ]);
  return { month: r?.month[0] ?? { tokens: 0, replies: 0 }, all: r?.all[0] ?? { tokens: 0, replies: 0 } };
}
