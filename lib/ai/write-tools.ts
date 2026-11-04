import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { createChangeSet, createOp, MAX_OPS, updateOp, type ChangeOp } from "@/lib/changes";
import { newId } from "@/lib/db/client";
import { repos } from "@/lib/db/repos";
import { planBillPaid, planClaimCreate, planClaimUpdate, planRuleApply, planTagCreate, planTransactionEdits, ruleRegex, type TxnEdit } from "@/lib/edits";
import { accountRefs, resolveAccounts, txnFilter } from "./tools";

const isoDate = z.string().describe("ISO date, e.g. 2026-10-01");
const tagNames = z.array(z.string().min(1).max(40)).max(10);
const where = z.object({
  query: z.string().optional().describe("Text in name, merchant, description or notes"),
  from: isoDate.optional(),
  to: isoDate.optional().describe("Inclusive end date"),
  accountId: z.string().optional(),
  accounts: accountRefs,
  tag: z.string().optional().describe('Tag name, or "untagged"'),
  category: z.string().optional(),
  minAmount: z.number().optional().describe("Dollars; positive = money out"),
  maxAmount: z.number().optional(),
});

const dollars = z.number().min(0).max(1e8).nullable().optional().describe("Dollars; null clears");
const claimKind = z.enum(["insurance", "reimbursement", "refund", "warranty", "other"]);
const claimStatus = z.enum(["draft", "submitted", "in_review", "approved", "paid", "denied", "closed"]);
const archive = z.boolean().optional().describe("true archives it (hidden, never deleted); false restores it");

export const proposeInput = z.object({
  summary: z.string().min(3).max(200).describe("One line the user will see, e.g. 'Tag 12 Uber rides as Transport'"),
  newTags: tagNames.default([]).describe("Tags to create on their own (tags named elsewhere are created automatically)"),
  edits: z
    .array(
      z.object({
        transactionIds: z.array(z.string()).max(200).optional().describe("Ids from searchTransactions"),
        where: where.optional().describe("Or select every matching transaction (max 1000)"),
        description: z.string().max(200).nullable().optional().describe("Display name override; null clears it"),
        notes: z.string().max(500).nullable().optional().describe("null clears notes"),
        addTags: tagNames.optional().describe("Tag names; unknown names become new tags"),
        removeTags: tagNames.optional(),
      }),
    )
    .max(20)
    .default([]),
  newTransactions: z
    .array(
      z.object({
        date: isoDate,
        amount: z.number().min(-1e8).max(1e8).describe("Dollars; positive = money out, negative = money in"),
        name: z.string().min(1).max(120),
        accountId: z.string().optional().describe("From getAccounts; omit for cash"),
        notes: z.string().max(500).optional(),
        tags: tagNames.optional(),
      }),
    )
    .max(20)
    .default([])
    .describe("Manual transactions (cash, missing purchases). Bank transactions come from sync only."),
  rules: z
    .array(
      z.object({
        field: z.enum(["merchant", "name", "description"]).default("merchant"),
        match: z.enum(["contains", "equals", "regex"]).default("contains"),
        pattern: z.string().min(1).max(200),
        tags: tagNames.min(1),
        applyToExisting: z.boolean().default(true),
      }),
    )
    .max(5)
    .default([]),
  ruleUpdates: z
    .array(
      z.object({
        id: z.string().describe("Rule id from getTags"),
        enabled: z.boolean().optional().describe("false switches the rule off (rules are archived this way, never deleted)"),
        field: z.enum(["merchant", "name", "description"]).optional(),
        match: z.enum(["contains", "equals", "regex"]).optional(),
        pattern: z.string().min(1).max(200).optional(),
        tags: tagNames.min(1).optional().describe("Replaces the rule's tags"),
      }),
    )
    .max(10)
    .default([]),
  tagUpdates: z
    .array(z.object({ id: z.string().describe("Tag id from getTags"), name: z.string().min(1).max(40).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }))
    .max(10)
    .default([]),
  claims: z
    .array(
      z.object({
        id: z.string().optional().describe("Claim id from getClaims to update it; omit to create a new claim"),
        title: z.string().min(1).max(120).optional().describe("Required for a new claim"),
        kind: claimKind.optional(),
        counterparty: z.string().max(80).nullable().optional().describe("Insurer, employer or merchant"),
        status: claimStatus.optional(),
        claimed: dollars,
        approved: dollars,
        paid: dollars,
        deadline: isoDate.nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        transactionIds: z.array(z.string()).max(20).optional().describe("Linked transaction ids (replaces the list)"),
        timelineNote: z.string().max(300).optional().describe("Adds a dated entry to the claim's timeline"),
        archive,
      }),
    )
    .max(10)
    .default([]),
  bills: z
    .array(
      z.object({
        id: z.string().optional().describe("Bill id from getBills to update it; omit to add a new bill"),
        name: z.string().min(1).max(80).optional().describe("Required for a new bill"),
        amount: dollars,
        dueDate: isoDate.optional().describe("Required for a new bill"),
        recurrence: z.enum(["none", "weekly", "monthly", "yearly"]).optional(),
        accountId: z.string().nullable().optional(),
        status: z.enum(["upcoming", "paid", "overdue"]).optional().describe("paid also schedules the next occurrence of a repeating bill"),
        archive,
      }),
    )
    .max(10)
    .default([]),
  accounts: z
    .array(
      z.object({
        id: z.string().describe("Account id from getAccounts"),
        nickname: z.string().max(60).nullable().describe("The user's own name for the account; null or empty removes it. The bank's name is kept."),
      }),
    )
    .max(20)
    .default([])
    .describe("Rename accounts (nickname only)"),
});

/**
 * The only write tool (CLAUDE.md §6). It never changes data: it stores a
 * *proposed* changeSet that the user applies (or discards) from the chat card.
 */
export function writeTools(userId: string) {
  const db = repos(userId);
  return {
    proposeChanges: tool({
      description:
        "Propose changes to the user's data: nickname accounts, edit transactions (description, notes, add/remove tags), add manual transactions, create/edit tags and tag rules (switch rules off), create/update/archive claims and bills, mark bills paid. Nothing changes until the user taps Apply on the card shown in chat. Find ids first (searchTransactions, getTags, getClaims, getBills, getAccounts), or pass a `where` filter for bulk transaction edits. Nothing is ever deleted: archive instead. Afterwards tell the user to review and apply; never say it is done.",
      inputSchema: proposeInput,
      execute: async (input) => {
        try {
          return await propose(userId, db, proposeInput.parse(input));
        } catch (e) {
          return { error: (e as Error).message || "Could not prepare the change" };
        }
      },
    }),
  };
}

type Input = z.infer<typeof proposeInput>;
type Values = Record<string, unknown>;
type Doc = Values & { _id: string };
export type RecordChange = { type: "transaction" | "tag" | "rule" | "claim" | "bill" | "account"; action: "add" | "edit" | "archive" | "restore"; title: string; changes: string[] };

const cents = (d: number | null | undefined) => (d === undefined ? undefined : d === null ? null : Math.round(d * 100));
const toDate = (s: string | null | undefined) => {
  if (s === undefined) return undefined;
  if (s === null) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${s}`);
  return d;
};
/** Drops undefined keys so only fields the model sent are patched. */
const defined = (v: Values) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));
const fmt = (k: string, v: unknown, names: Map<string, string>): string =>
  v === null || v === undefined ? "none"
  : k.endsWith("Cents") ? `$${((v as number) / 100).toFixed(2)}`
  : v instanceof Date || k.endsWith("At") || k === "dueDate" || k === "date" ? new Date(v as string).toISOString().slice(0, 10)
  : k === "tagIds" ? (v as string[]).map((i) => names.get(i) ?? "?").join(", ") || "none"
  : Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}`
  : String(v);
const LABEL: Record<string, string> = { amountCents: "amount", claimedCents: "claimed", approvedCents: "approved", paidCents: "paid", deadlineAt: "deadline", dueDate: "due", tagIds: "tags", transactionIds: "linked transactions" };
const SKIP = new Set(["timeline", "submittedAt", "archivedAt", "documentIds", "source", "currency", "pending", "paidTransactionId"]);

function describe(op: ChangeOp, names: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(op.after ?? {})) {
    if (SKIP.has(k) || (op.kind === "create" && (k === "title" || k === "name" || v === null || (Array.isArray(v) && !v.length)))) continue;
    const label = LABEL[k] ?? k;
    out.push(op.kind === "create" ? `${label}: ${fmt(k, v, names)}` : `${label}: ${fmt(k, op.before?.[k], names)} → ${fmt(k, v, names)}`);
  }
  if (op.collection === "claims" && op.kind === "update" && op.after?.timeline) {
    const t = op.after.timeline as { note: string }[];
    out.push(`timeline: ${t[t.length - 1].note}`);
  }
  return out;
}

async function propose(userId: string, db: ReturnType<typeof repos>, input: Input) {
  const nothing = !input.newTags.length && !input.edits.length && !input.rules.length && !input.newTransactions.length && !input.ruleUpdates.length && !input.tagUpdates.length && !input.claims.length && !input.bills.length && !input.accounts.length;
  if (nothing) return { error: "Nothing to change" };
  const existing = await db.tags.find({});
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t._id]));
  const names = new Map(existing.map((t) => [t._id, t.name]));
  const ops: ChangeOp[] = [];
  const created: string[] = [];
  const records: RecordChange[] = [];
  const record = (type: RecordChange["type"], action: RecordChange["action"], title: string, op: ChangeOp | null) => {
    if (op) records.push({ type, action, title, changes: action === "archive" || action === "restore" ? [] : describe(op, names) });
  };

  const tagIds = (list: string[] = [], createMissing: boolean) =>
    list.flatMap((n) => {
      const key = n.trim().toLowerCase();
      const hit = byName.get(key);
      if (hit) return [hit];
      if (!createMissing) return [];
      const { id, op } = planTagCreate(n);
      byName.set(key, id);
      names.set(id, n.trim());
      created.push(n.trim());
      ops.push(op);
      return [id];
    });
  tagIds(input.newTags, true);
  const accountOk = async (id: string | null | undefined) => {
    if (id && !(await db.accounts.byId(id))) throw new Error(`Unknown account ${id}. Use getAccounts for ids.`);
  };
  const ownTxnIds = async (ids?: string[]) => (ids ? (await db.transactions.find({ _id: { $in: ids } }, { projection: { _id: 1 } })).map((t) => t._id) : undefined);

  // account nicknames
  let allAccounts: Awaited<ReturnType<typeof db.accounts.find>> | undefined;
  for (const a of input.accounts) {
    const acct = await db.accounts.byId(a.id);
    if (!acct) throw new Error(`Unknown account ${a.id}. Use getAccounts for ids.`);
    const nickname = a.nickname?.trim() || null;
    const op = updateOp("accounts", acct as unknown as Doc, { nickname });
    if (op) ops.push(op);
    record("account", "edit", `${acct.name}${acct.mask ? ` •••${acct.mask}` : ""}`, op);
  }

  // transaction edits
  const edits: TxnEdit[] = [];
  for (const e of input.edits) {
    let ids = e.transactionIds ?? [];
    if (e.where) {
      const acc = resolveAccounts(allAccounts ??= await db.accounts.find({}), e.where);
      if ("error" in acc) return acc;
      const found = await db.transactions.find(txnFilter({ ...e.where, accountIds: acc.ids }, byName), { projection: { _id: 1 }, limit: MAX_OPS + 1 });
      if (found.length > MAX_OPS) return { error: `That filter matches more than ${MAX_OPS} transactions. Narrow it down.` };
      ids = [...ids, ...found.map((t) => t._id)];
    }
    if (!ids.length) continue;
    edits.push({ ids, description: e.description, notes: e.notes, addTagIds: tagIds(e.addTags, true), removeTagIds: tagIds(e.removeTags, false) });
  }
  const txnOps = await planTransactionEdits(userId, edits);

  // tag edits
  for (const t of input.tagUpdates) {
    const tag = existing.find((x) => x._id === t.id);
    if (!tag) throw new Error(`Unknown tag ${t.id}. Use getTags for ids.`);
    const name = t.name?.trim();
    if (name && byName.get(name.toLowerCase()) && byName.get(name.toLowerCase()) !== tag._id) throw new Error(`A tag named ${name} already exists`);
    const op = updateOp("tags", tag as unknown as Doc, defined({ name, color: t.color }));
    if (op) ops.push(op);
    record("tag", "edit", tag.name, op);
    if (name) names.set(tag._id, name);
  }

  // new rules (optionally applied to existing transactions, merged with edits above)
  const ruleOps: ChangeOp[] = [];
  for (const r of input.rules) {
    const rule = { field: r.field, match: r.match, pattern: r.pattern.trim(), tagIds: tagIds(r.tags, true) };
    ruleRegex(rule);
    ruleOps.push(createOp("tagRules", newId(), { ...rule, enabled: true }));
    if (r.applyToExisting) {
      for (const op of await planRuleApply(userId, rule)) {
        const prior = txnOps.find((o) => o.docId === op.docId);
        if (!prior) {
          txnOps.push(op);
          continue;
        }
        const base = (prior.after?.tagIds ?? op.before?.tagIds ?? []) as string[];
        prior.before = { ...prior.before, tagIds: prior.before?.tagIds ?? op.before?.tagIds ?? [] };
        prior.after = { ...prior.after, tagIds: [...new Set([...base, ...rule.tagIds])] };
      }
    }
  }

  // rule edits (switching off is how a rule is archived)
  for (const u of input.ruleUpdates) {
    const rule = await db.tagRules.byId(u.id);
    if (!rule) throw new Error(`Unknown rule ${u.id}. Use getTags for ids.`);
    const patch = defined({ enabled: u.enabled, field: u.field, match: u.match, pattern: u.pattern?.trim(), tagIds: u.tags ? tagIds(u.tags, true) : undefined });
    if (patch.pattern || patch.match) ruleRegex({ match: (patch.match ?? rule.match) as typeof rule.match, pattern: (patch.pattern ?? rule.pattern) as string });
    const op = updateOp("tagRules", rule as unknown as Doc, patch);
    if (op) ruleOps.push(op);
    record("rule", u.enabled === false && Object.keys(patch).length === 1 ? "archive" : "edit", `Rule "${rule.pattern}"`, op);
  }

  // manual transactions
  for (const t of input.newTransactions) {
    await accountOk(t.accountId);
    const op = createOp("transactions", newId(), {
      source: "manual", date: toDate(t.date), amountCents: cents(t.amount), currency: "USD", name: t.name.trim(), accountId: t.accountId ?? null,
      notes: t.notes?.trim() || null, tagIds: tagIds(t.tags, true), pending: false,
    });
    ops.push(op);
    record("transaction", "add", t.name.trim(), op);
  }

  // claims
  for (const c of input.claims) {
    const fields = defined({
      title: c.title?.trim(), kind: c.kind, counterparty: c.counterparty, status: c.status, claimedCents: cents(c.claimed), approvedCents: cents(c.approved), paidCents: cents(c.paid),
      deadlineAt: toDate(c.deadline), notes: c.notes, transactionIds: await ownTxnIds(c.transactionIds),
    });
    if (!c.id) {
      if (!c.title) throw new Error("A new claim needs a title");
      const { op } = planClaimCreate({ ...fields, title: c.title.trim(), kind: c.kind ?? "other", status: c.status ?? "draft" });
      ops.push(op);
      record("claim", "add", c.title.trim(), op);
      continue;
    }
    const claim = await db.claims.byId(c.id);
    if (!claim) throw new Error(`Unknown claim ${c.id}. Use getClaims for ids.`);
    if (c.archive === true && !claim.archivedAt) fields.archivedAt = new Date();
    if (c.archive === false && claim.archivedAt) fields.archivedAt = null;
    const op = planClaimUpdate(claim, fields, c.timelineNote);
    if (op) ops.push(op);
    const onlyArchive = c.archive !== undefined && Object.keys(fields).length === 1 && "archivedAt" in fields;
    record("claim", onlyArchive ? (c.archive ? "archive" : "restore") : "edit", claim.title, op);
  }

  // bills
  for (const b of input.bills) {
    await accountOk(b.accountId);
    const fields = defined({ name: b.name?.trim(), amountCents: cents(b.amount), dueDate: toDate(b.dueDate), recurrence: b.recurrence, accountId: b.accountId });
    if (!b.id) {
      if (!b.name || !b.dueDate) throw new Error("A new bill needs a name and a due date");
      const op = createOp("bills", newId(), { recurrence: "none", amountCents: null, accountId: null, ...fields, source: "manual", status: b.status ?? "upcoming", paidTransactionId: null });
      ops.push(op);
      record("bill", "add", b.name.trim(), op);
      continue;
    }
    const bill = await db.bills.byId(b.id);
    if (!bill) throw new Error(`Unknown bill ${b.id}. Use getBills for ids.`);
    if (b.archive === true && !bill.archivedAt) fields.archivedAt = new Date();
    if (b.archive === false && bill.archivedAt) fields.archivedAt = null;
    // "paid" goes through the same planner as the Bills page, so a repeating bill gets its next occurrence
    // (field edits and the paid change stay separate ops on different fields)
    const paying = b.status === "paid" && bill.status !== "paid";
    if (b.status && !paying) fields.status = b.status;
    const op = updateOp("bills", bill as unknown as Doc, fields);
    if (op) ops.push(op);
    if (paying) {
      const paid = await planBillPaid(userId, bill._id);
      ops.push(...paid.ops);
      records.push({ type: "bill", action: "edit", title: bill.name, changes: ["status: paid", ...(paid.ops.length > 1 ? ["next due: " + fmt("dueDate", paid.ops[1].after?.dueDate, names)] : [])] });
    }
    const onlyArchive = b.archive !== undefined && Object.keys(fields).length === 1 && "archivedAt" in fields;
    record("bill", onlyArchive ? (b.archive ? "archive" : "restore") : "edit", bill.name, op);
  }

  ops.push(...txnOps, ...ruleOps);
  if (!ops.length || (!input.newTags.length && ops.every((o) => o.collection === "tags" && o.kind === "create"))) return { error: "Nothing would change: the data already looks like that." };

  const cs = await createChangeSet(userId, { summary: input.summary, origin: "chat", ops });
  const sample = await db.transactions.find({ _id: { $in: txnOps.slice(0, 15).map((o) => o.docId) } }, { projection: { date: 1, name: 1, merchant: 1, description: 1, amountCents: 1 } });
  const tagLabel = (ids: unknown) => ((ids as string[] | null) ?? []).map((id) => names.get(id) ?? "?");

  return {
    changeSetId: cs._id,
    status: "proposed" as const,
    summary: cs.summary,
    counts: { transactions: txnOps.length, newTags: created.length, rules: input.rules.length, records: records.length },
    newTags: created,
    rules: input.rules.map((r) => `${r.field} ${r.match} "${r.pattern}" → ${r.tags.join(", ")}`),
    records,
    preview: txnOps.slice(0, 15).map((op) => {
      const t = sample.find((s) => s._id === op.docId);
      const changes: string[] = [];
      for (const [k, v] of Object.entries(op.after ?? {})) {
        if (k === "tagIds") {
          const before = new Set(tagLabel(op.before?.tagIds));
          const after = new Set(tagLabel(v));
          for (const n of after) if (!before.has(n)) changes.push(`+${n}`);
          for (const n of before) if (!after.has(n)) changes.push(`−${n}`);
        } else changes.push(`${k}: ${v === null ? "cleared" : String(v)}`);
      }
      return {
        date: t ? new Date(t.date).toISOString().slice(0, 10) : null,
        description: t ? (t.description ?? t.merchant ?? t.name) : op.docId,
        amount: t ? t.amountCents / 100 : null,
        changes,
      };
    }),
    note: "Proposed only. Nothing has changed yet: the user must tap Apply on the card.",
  };
}

export type ProposeOutput = Awaited<ReturnType<typeof propose>>;
