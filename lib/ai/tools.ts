import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { PLAID_PORTAL_URL, bankAccessGuide, detectApps } from "@/lib/bank/connected-apps";
import { repos } from "@/lib/db/repos";
import { appTransactions } from "@/lib/queries";
import { AnalyticsQueryError, buildScopedPipeline, ANALYTICS_COLLECTIONS } from "./analytics";

const isoDate = z.string().describe("ISO date, e.g. 2026-10-01");
const dollars = (c?: number) => (c === undefined || c === null ? null : Math.round(c) / 100);
const day = (d?: Date) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const notDeleted = { deletedAt: { $exists: false } };

/** Read-only chat tools (CLAUDE.md §6). Every query is scoped to `userId` via repos(). */
export function readTools(userId: string) {
  const db = repos(userId);

  const tagMaps = async () => {
    const tags = await db.tags.find({});
    return { byId: new Map(tags.map((t) => [t._id, t.name])), byName: new Map(tags.map((t) => [t.name.toLowerCase(), t._id])) };
  };

  return {
    getAccounts: tool({
      description: "List bank accounts with balances (dollars), type, credit limit and institution. archived: true = bank disconnected, balance frozen at archivedOn, history still searchable.",
      inputSchema: z.object({}),
      execute: async () => {
        const [accounts, items] = await Promise.all([db.accounts.find({}), db.items.find({})]);
        return accounts.map((a) => ({
          id: a._id,
          name: a.name,
          mask: a.mask,
          type: a.type,
          subtype: a.subtype,
          institution: items.find((i) => i._id === a.itemId)?.institutionName,
          currentBalance: dollars(a.currentCents),
          available: dollars(a.availableCents),
          creditLimit: dollars(a.limitCents),
          ...(a.archivedAt ? { archived: true, archivedOn: a.archivedAt.toISOString().slice(0, 10) } : {}),
        }));
      },
    }),

    getTags: tool({
      description: "List the user's tags (names, colors, parent).",
      inputSchema: z.object({}),
      execute: async () => (await db.tags.find({})).map((t) => ({ id: t._id, name: t.name, color: t.color, parentId: t.parentId })),
    }),

    searchTransactions: tool({
      description:
        "Find individual transactions. Amounts in dollars; positive = money out (spend), negative = money in. Use for lists and lookups, not for totals (use getSpendingSummary).",
      inputSchema: z.object({
        query: z.string().optional().describe("Text in name, merchant, description or notes"),
        from: isoDate.optional(),
        to: isoDate.optional().describe("Inclusive end date"),
        accountId: z.string().optional(),
        tag: z.string().optional().describe("Tag name"),
        category: z.string().optional().describe("Provider category, e.g. FOOD_AND_DRINK"),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
        pending: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      execute: async (i) => {
        const tags = await tagMaps();
        const f = txnFilter(i, tags.byName);
        const [rows, total, accounts] = await Promise.all([
          db.transactions.find(f, { sort: { date: -1 }, limit: i.limit, projection: { raw: 0 } }),
          db.transactions.count(f),
          db.accounts.find({}),
        ]);
        return {
          total,
          shown: rows.length,
          transactions: rows.map((t) => ({
            id: t._id,
            date: day(t.date),
            description: t.description ?? t.merchant ?? t.name,
            amount: dollars(t.amountCents),
            account: accounts.find((a) => a._id === t.accountId)?.name,
            category: t.category,
            tags: t.tagIds.map((x) => tags.byId.get(x)).filter(Boolean),
            pending: t.pending,
            notes: t.notes,
          })),
        };
      },
    }),

    getSpendingSummary: tool({
      description:
        "Totals over a date range grouped by tag, category, merchant, account, month or week. Computed in the database; use for any totals, comparisons or charts. Transfers are excluded by default.",
      inputSchema: z.object({
        from: isoDate,
        to: isoDate.describe("Inclusive end date"),
        groupBy: z.enum(["tag", "category", "merchant", "account", "month", "week", "none"]).default("category"),
        direction: z.enum(["spend", "income", "both"]).default("spend"),
        tag: z.string().optional().describe("Only this tag"),
        query: z.string().optional().describe("Only transactions whose name/merchant/description matches"),
        includeTransfers: z.boolean().default(false),
        limit: z.number().int().min(1).max(50).default(15),
      }),
      execute: async (i) => {
        const tags = await tagMaps();
        const match: Record<string, unknown> = { ...notDeleted, date: { $gte: new Date(i.from), $lte: endOfDay(i.to) } };
        if (i.direction === "spend") match.amountCents = { $gt: 0 };
        if (i.direction === "income") match.amountCents = { $lt: 0 };
        if (!i.includeTransfers) match.category = { $nin: ["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"] };
        if (i.tag) match.tagIds = tags.byName.get(i.tag.toLowerCase()) ?? "__none__";
        if (i.query) {
          const rx = { $regex: i.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
          match.$or = [{ name: rx }, { merchant: rx }, { description: rx }];
        }
        const key: Record<string, unknown> = {
          tag: "$tagIds",
          category: { $ifNull: ["$category", "UNCATEGORIZED"] },
          merchant: { $ifNull: ["$description", { $ifNull: ["$merchant", "$name"] }] },
          account: "$accountId",
          month: { $dateToString: { format: "%Y-%m", date: "$date" } },
          week: { $dateToString: { format: "%G-W%V", date: "$date" } },
          none: "all",
        };
        const pipeline: Record<string, unknown>[] = [{ $match: match }];
        if (i.groupBy === "tag") pipeline.push({ $unwind: { path: "$tagIds", preserveNullAndEmptyArrays: true } });
        pipeline.push(
          { $group: { _id: key[i.groupBy], totalCents: { $sum: "$amountCents" }, count: { $sum: 1 } } },
          { $sort: i.groupBy === "month" || i.groupBy === "week" ? { _id: 1 } : { totalCents: -1 } },
          { $limit: i.limit },
        );
        const rows = await db.transactions.aggregate<{ _id: string | null; totalCents: number; count: number }>(pipeline);
        const accounts = i.groupBy === "account" ? await db.accounts.find({}) : [];
        const label = (id: string | null) =>
          i.groupBy === "tag" ? (id ? tags.byId.get(id) ?? "Unknown tag" : "Untagged")
          : i.groupBy === "account" ? accounts.find((a) => a._id === id)?.name ?? "Manual"
          : id ?? "Unknown";
        const groups = rows.map((r) => ({ group: label(r._id), total: dollars(Math.abs(r.totalCents)), count: r.count }));
        return { from: i.from, to: i.to, direction: i.direction, groupBy: i.groupBy, grandTotal: dollars(groups.reduce((s, g) => s + (g.total ?? 0) * 100, 0)), groups };
      },
    }),

    getBills: tool({
      description: "Upcoming and recent bills and card payment due dates (from liabilities, manual bills, recurring).",
      inputSchema: z.object({ from: isoDate.optional(), to: isoDate.optional() }),
      execute: async ({ from, to }) => {
        const f: Record<string, unknown> = {};
        if (from || to) f.dueDate = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: endOfDay(to) } : {}) };
        const bills = await db.bills.find(f, { sort: { dueDate: 1 }, limit: 50 });
        return bills.map((b) => ({ name: b.name, dueDate: day(b.dueDate), amount: dollars(b.amountCents), status: b.status, source: b.source }));
      },
    }),

    getConnectedApps: tool({
      description:
        "Outside apps (PayPal, Venmo, Credit Karma, Robinhood…) seen in each account's transactions, plus where the user can see every app with access (Plaid Portal and the bank's own page). Inferred from transactions only: apps that only read data leave no trace.",
      inputSchema: z.object({}),
      execute: async () => {
        const [items, accounts, txns] = await Promise.all([db.items.find({}), db.accounts.find({}), appTransactions(userId)]);
        const apps = detectApps(txns);
        return {
          plaidPortal: PLAID_PORTAL_URL,
          banks: items.map((i) => ({
            bank: i.institutionName,
            archived: i.status === "archived",
            reviewAllAppsAt: bankAccessGuide(i.institutionName),
            accounts: accounts
              .filter((a) => a.itemId === i._id)
              .map((a) => ({ account: a.name, mask: a.mask, appsSeen: (apps[a._id] ?? []).map((x) => ({ app: x.name, kind: x.kind, transactions: x.count, lastSeen: day(x.lastSeen) })) })),
          })),
        };
      },
    }),

    getLiabilities: tool({
      description: "Credit card / loan details: statement balance, minimum payment, next due date, APR.",
      inputSchema: z.object({}),
      execute: async () => {
        const [ls, accounts] = await Promise.all([db.liabilities.find({}, { projection: { raw: 0 } }), db.accounts.find({})]);
        return ls.map((l) => {
          const a = accounts.find((x) => x._id === l.accountId);
          return {
            account: a?.name, mask: a?.mask, kind: l.kind, currentBalance: dollars(a?.currentCents), creditLimit: dollars(a?.limitCents),
            statementBalance: dollars(l.lastStatementBalanceCents), minimumPayment: dollars(l.minimumPaymentCents),
            nextPaymentDueDate: day(l.nextPaymentDueDate), lastPaymentDate: day(l.lastPaymentDate), lastPayment: dollars(l.lastPaymentCents), apr: l.aprPercent,
          };
        });
      },
    }),

    getClaims: tool({
      description: "Insurance claims, reimbursements and refunds with status and amounts.",
      inputSchema: z.object({ status: z.string().optional() }),
      execute: async ({ status }) => {
        const claims = await db.claims.find(status ? { status } : {}, { sort: { updatedAt: -1 }, limit: 50 });
        return claims.map((c) => ({ id: c._id, title: c.title, kind: c.kind, status: c.status, counterparty: c.counterparty, claimed: dollars(c.claimedCents), approved: dollars(c.approvedCents), paid: dollars(c.paidCents), deadline: day(c.deadlineAt) }));
      },
    }),

    getDocuments: tool({
      description:
        "Uploaded documents (statements, receipts, bills, claim letters) and what was extracted from them. Without documentId: the 10 most recent. With documentId: its extracted records (dollars; positive = money out). Importing happens only on the review page /documents/<id>, which the user opens.",
      inputSchema: z.object({ documentId: z.string().optional() }),
      execute: async ({ documentId }) => {
        type Ex = { summary?: string; warnings?: string[]; transactions?: { date: string; description: string; amountCents: number; duplicateOf?: string }[]; bills?: { name: string; amountCents?: number; dueDate: string }[]; claims?: { title: string; kind: string; counterparty?: string; claimedCents?: number }[] };
        if (!documentId) {
          const docs = await db.documents.find({}, { sort: { createdAt: -1 }, limit: 10 });
          return docs.map((d) => {
            const ex = (d.extracted ?? {}) as Ex;
            return { id: d._id, fileName: d.fileName, uploaded: day(d.createdAt), status: d.status, transactions: ex.transactions?.length ?? 0, bills: ex.bills?.length ?? 0, claims: ex.claims?.length ?? 0, reviewUrl: `/documents/${d._id}` };
          });
        }
        const d = await db.documents.byId(documentId);
        if (!d) return { error: "Document not found" };
        const ex = (d.extracted ?? {}) as Ex;
        return {
          fileName: d.fileName, status: d.status, error: d.error, summary: ex.summary, warnings: ex.warnings, reviewUrl: `/documents/${d._id}`,
          transactions: ex.transactions?.slice(0, 50).map((t) => ({ date: t.date, description: t.description, amount: dollars(t.amountCents), possibleDuplicate: !!t.duplicateOf })),
          totalTransactions: ex.transactions?.length ?? 0,
          bills: ex.bills?.map((b) => ({ name: b.name, amount: dollars(b.amountCents), dueDate: b.dueDate })),
          claims: ex.claims?.map((c) => ({ title: c.title, kind: c.kind, counterparty: c.counterparty, amount: dollars(c.claimedCents) })),
        };
      },
    }),

    runAnalyticsQuery: tool({
      description: `Run a read-only MongoDB aggregation for questions the other tools can't answer. Collections: ${ANALYTICS_COLLECTIONS.join(", ")}. Amounts are integer cents (amountCents; positive = money out). Dates are ISO strings. transactions fields: date, amountCents, name, merchant, description, category, categoryDetailed, pending, accountId, tagIds (array of tag _ids; $lookup tags for names), deletedAt. The user filter is added automatically. Stages allowed: $match $group $sort $limit $project $addFields $unwind $count $bucket $facet $lookup and similar. Max 200 rows.`,
      inputSchema: z.object({
        collection: z.enum(ANALYTICS_COLLECTIONS),
        pipeline: z.array(z.record(z.string(), z.unknown())).max(30),
      }),
      execute: async ({ collection, pipeline }) => {
        try {
          const scoped = buildScopedPipeline(collection, pipeline, userId);
          // scoped repo prepends its own userId $match too (defense in depth)
          const rows = await db[collection].aggregate(scoped);
          return { rows };
        } catch (e) {
          if (e instanceof AnalyticsQueryError) return { error: e.message };
          return { error: "Query failed. Check field names and operators." };
        }
      },
    }),
  };
}

export interface TxnWhere {
  query?: string;
  from?: string;
  to?: string;
  accountId?: string;
  tag?: string;
  category?: string;
  minAmount?: number;
  maxAmount?: number;
  pending?: boolean;
}

/** Mongo filter for live transactions, shared by search and proposeChanges. Amounts in dollars. */
export function txnFilter(i: TxnWhere, tagIdByName: Map<string, string>) {
  const f: Record<string, unknown> = { ...notDeleted };
  if (i.query) {
    const rx = { $regex: i.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    f.$or = [{ name: rx }, { merchant: rx }, { description: rx }, { notes: rx }];
  }
  if (i.from || i.to) f.date = { ...(i.from ? { $gte: new Date(i.from) } : {}), ...(i.to ? { $lte: endOfDay(i.to) } : {}) };
  if (i.accountId) f.accountId = i.accountId;
  if (i.tag) f.tagIds = i.tag.toLowerCase() === "untagged" ? { $size: 0 } : tagIdByName.get(i.tag.toLowerCase()) ?? "__none__";
  if (i.category) f.category = i.category.toUpperCase();
  if (i.minAmount !== undefined || i.maxAmount !== undefined) {
    f.amountCents = { ...(i.minAmount !== undefined ? { $gte: Math.round(i.minAmount * 100) } : {}), ...(i.maxAmount !== undefined ? { $lte: Math.round(i.maxAmount * 100) } : {}) };
  }
  if (i.pending !== undefined) f.pending = i.pending;
  return f;
}

function endOfDay(d: string) {
  return d.length <= 10 ? new Date(`${d}T23:59:59.999Z`) : new Date(d);
}

export type ReadTools = ReturnType<typeof readTools>;
