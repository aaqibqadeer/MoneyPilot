import "server-only";
import { repos } from "@/lib/db/repos";

/** Server-side data for pages. All aggregation runs in MongoDB (or mingo in demo mode). */

export async function accountsOverview(userId: string) {
  const db = repos(userId);
  const [items, accounts, liabilities] = await Promise.all([
    db.items.find({}, { sort: { createdAt: 1 } }),
    db.accounts.find({}, { sort: { name: 1 } }),
    db.liabilities.find({}),
  ]);
  return items.map((i) => ({
    _id: i._id,
    institutionName: i.institutionName,
    status: i.status,
    error: i.error,
    lastSyncedAt: i.lastSyncedAt,
    accounts: accounts
      .filter((a) => a.itemId === i._id)
      .map((a) => ({ ...a, liability: liabilities.find((l) => l.accountId === a._id) })),
  }));
}

export interface TxnQuery {
  q?: string;
  accountId?: string;
  page?: number;
  pageSize?: number;
}

export async function listTransactions(userId: string, { q, accountId, page = 1, pageSize = 50 }: TxnQuery) {
  const db = repos(userId);
  const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
  if (accountId) filter.accountId = accountId;
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
    db.bills.find({ dueDate: { $gte: new Date(now.getTime() - 86400000), $lte: in30 } }, { sort: { dueDate: 1 }, limit: 6 }),
    db.transactions.find({ deletedAt: { $exists: false } }, { sort: { date: -1 }, limit: 6, projection: { raw: 0 } }),
    db.items.find({}, { sort: { lastSyncedAt: -1 } }),
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
