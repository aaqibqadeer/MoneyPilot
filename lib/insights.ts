import "server-only";
import { repos } from "@/lib/db/repos";

/** Insights (Phase 9). All math runs in the database; amounts are cents, positive = money out. */

const TRANSFERS = ["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"];
const live = { deletedAt: { $exists: false }, category: { $nin: TRANSFERS } };
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const monthStart = (key: string, offset = 0) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1));
};

/** Spend and income per month for the last `months` months, oldest first, with empty months filled. */
export async function monthlyFlow(userId: string, months = 12, now = new Date()) {
  const from = monthStart(monthKey(now), -(months - 1));
  const rows = await repos(userId).transactions.aggregate<{ _id: string; spend: number; income: number }>([
    { $match: { ...live, date: { $gte: from } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
        spend: { $sum: { $cond: [{ $gt: ["$amountCents", 0] }, "$amountCents", 0] } },
        income: { $sum: { $cond: [{ $lt: ["$amountCents", 0] }, { $multiply: ["$amountCents", -1] }, 0] } },
      },
    },
  ]);
  const by = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: months }, (_, i) => {
    const key = monthKey(monthStart(monthKey(from), i));
    const r = by.get(key);
    return { month: key, spend: r?.spend ?? 0, income: r?.income ?? 0 };
  });
}

/** One month's report: totals, tags vs the month before, top merchants and the biggest expense. */
export async function monthReport(userId: string, month: string) {
  const db = repos(userId);
  const start = monthStart(month);
  const end = monthStart(month, 1);
  const prev = monthStart(month, -1);
  const [totals, tags, merchants, biggest, tagDocs] = await Promise.all([
    db.transactions.aggregate<{ _id: null; spend: number; income: number; count: number }>([
      { $match: { ...live, date: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: null,
          spend: { $sum: { $cond: [{ $gt: ["$amountCents", 0] }, "$amountCents", 0] } },
          income: { $sum: { $cond: [{ $lt: ["$amountCents", 0] }, { $multiply: ["$amountCents", -1] }, 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
    db.transactions.aggregate<{ _id: { tag: string | null; cur: boolean }; total: number }>([
      { $match: { ...live, amountCents: { $gt: 0 }, date: { $gte: prev, $lt: end } } },
      { $unwind: { path: "$tagIds", preserveNullAndEmptyArrays: true } },
      { $group: { _id: { tag: { $ifNull: ["$tagIds", null] }, cur: { $gte: ["$date", start] } }, total: { $sum: "$amountCents" } } },
    ]),
    db.transactions.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { ...live, amountCents: { $gt: 0 }, date: { $gte: start, $lt: end } } },
      { $group: { _id: { $ifNull: ["$merchant", "$name"] }, total: { $sum: "$amountCents" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]),
    db.transactions.find({ ...live, amountCents: { $gt: 0 }, date: { $gte: start, $lt: end } }, { sort: { amountCents: -1 }, limit: 1, projection: { raw: 0 } }),
    db.tags.find({}, { projection: { _id: 1, name: 1, color: 1 } }),
  ]);
  const t = totals[0];
  const tagMeta = new Map(tagDocs.map((x) => [x._id, x]));
  const byTag = new Map<string, { name: string; color: string; total: number; prev: number }>();
  for (const r of tags) {
    const key = r._id.tag ?? "none";
    const meta = r._id.tag ? tagMeta.get(r._id.tag) : undefined;
    const row = byTag.get(key) ?? { name: meta?.name ?? "Untagged", color: meta?.color ?? "#94a3b8", total: 0, prev: 0 };
    if (r._id.cur) row.total += r.total;
    else row.prev += r.total;
    byTag.set(key, row);
  }
  const spend = t?.spend ?? 0;
  const income = t?.income ?? 0;
  return {
    month,
    spend,
    income,
    net: income - spend,
    savingsRate: income ? Math.round(((income - spend) / income) * 100) : null,
    count: t?.count ?? 0,
    tags: [...byTag.values()].filter((x) => x.total || x.prev).sort((a, b) => b.total - a.total),
    merchants: merchants.map((m) => ({ name: m._id, total: m.total, count: m.count })),
    biggest: biggest[0] ? { name: biggest[0].description ?? biggest[0].merchant ?? biggest[0].name, amountCents: biggest[0].amountCents, date: biggest[0].date } : null,
  };
}
