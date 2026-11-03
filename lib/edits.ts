import "server-only";
import { HttpError } from "@/lib/api";
import { createOp, deleteOp, MAX_OPS, updateOp, type ChangeOp } from "@/lib/changes";
import { newId } from "@/lib/db/client";
import { repos } from "@/lib/db/repos";
import type { Doc } from "@/lib/db/schemas";
import { nextDue } from "@/lib/bills/recurring";

/** Builders that turn an edit request (from the UI or chat) into changeSet ops. Nothing here writes. */

type Values = Record<string, unknown>;
export type TagRule = Doc<"tagRules">;

export const TAG_COLORS = ["#16a34a", "#ea580c", "#2563eb", "#9333ea", "#0891b2", "#dc2626", "#ca8a04", "#db2777", "#4f46e5", "#64748b"];
export const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clean = (s?: string | null) => (s === undefined ? undefined : s === null ? null : s.trim().slice(0, 500) || null);

export interface TxnEdit {
  ids: string[];
  description?: string | null;
  notes?: string | null;
  /** Replace all tags. */
  setTagIds?: string[];
  addTagIds?: string[];
  removeTagIds?: string[];
}

export async function planTransactionEdits(userId: string, edits: TxnEdit[]): Promise<ChangeOp[]> {
  const db = repos(userId);
  const ids = [...new Set(edits.flatMap((e) => e.ids))];
  if (ids.length > MAX_OPS) throw new HttpError(400, `Too many transactions at once (max ${MAX_OPS})`);
  const docs = await db.transactions.find({ _id: { $in: ids }, deletedAt: { $exists: false } }, { projection: { _id: 1, description: 1, notes: 1, tagIds: 1 } });
  const state = new Map(docs.map((d) => [d._id, d as unknown as Values & { _id: string }]));
  const patches = new Map<string, Values>();

  for (const e of edits) {
    for (const id of e.ids) {
      const doc = state.get(id);
      if (!doc) continue;
      const p = patches.get(id) ?? {};
      if (e.description !== undefined) p.description = clean(e.description);
      if (e.notes !== undefined) p.notes = clean(e.notes);
      if (e.setTagIds || e.addTagIds || e.removeTagIds) {
        let tags = (p.tagIds as string[] | undefined) ?? ((doc.tagIds as string[] | undefined) ?? []);
        if (e.setTagIds) tags = e.setTagIds;
        tags = [...new Set([...tags, ...(e.addTagIds ?? [])])].filter((t) => !e.removeTagIds?.includes(t));
        p.tagIds = tags;
      }
      patches.set(id, p);
    }
  }
  return [...patches].flatMap(([id, p]) => updateOp("transactions", state.get(id)!, p) ?? []);
}

export function planTagCreate(name: string, color?: string) {
  const id = newId();
  const n = name.trim().slice(0, 40);
  if (!n) throw new HttpError(400, "Tag name is required");
  return { id, op: createOp("tags", id, { name: n, color: color ?? TAG_COLORS[Math.abs(hash(n)) % TAG_COLORS.length] }) };
}

/** Deleting a tag also removes it from every transaction and rule, all in one undoable change. */
export async function planTagDelete(userId: string, tagId: string): Promise<ChangeOp[]> {
  const db = repos(userId);
  const tag = await db.tags.byId(tagId);
  if (!tag) throw new HttpError(404, "Tag not found");
  const [txns, rules] = await Promise.all([
    db.transactions.find({ tagIds: tagId }, { projection: { _id: 1, tagIds: 1 }, limit: MAX_OPS }),
    db.tagRules.find({ tagIds: tagId }),
  ]);
  return [
    deleteOp("tags", tag as unknown as Values & { _id: string }),
    ...txns.flatMap((t) => updateOp("transactions", t as unknown as Values & { _id: string }, { tagIds: t.tagIds.filter((x) => x !== tagId) }) ?? []),
    ...rules.flatMap((r) => {
      const left = r.tagIds.filter((x) => x !== tagId);
      return left.length ? (updateOp("tagRules", r as unknown as Values & { _id: string }, { tagIds: left }) ?? []) : [deleteOp("tagRules", r as unknown as Values & { _id: string })];
    }),
  ];
}

export function ruleRegex(rule: Pick<TagRule, "match" | "pattern">) {
  const src = rule.match === "regex" ? rule.pattern : rule.match === "equals" ? `^${escapeRx(rule.pattern)}$` : escapeRx(rule.pattern);
  try {
    new RegExp(src, "i");
  } catch {
    throw new HttpError(400, "Invalid regular expression");
  }
  return src;
}

/** Mongo filter for non-deleted transactions a rule matches. */
export function ruleFilter(rule: Pick<TagRule, "field" | "match" | "pattern">) {
  return { deletedAt: { $exists: false }, [rule.field]: { $regex: ruleRegex(rule), $options: "i" } };
}

/** Ops that add a rule's tags to every matching transaction missing any of them. */
export async function planRuleApply(userId: string, rule: Pick<TagRule, "field" | "match" | "pattern" | "tagIds">) {
  const db = repos(userId);
  const txns = await db.transactions.find(
    { ...ruleFilter(rule), tagIds: { $not: { $all: rule.tagIds } } },
    { projection: { _id: 1, tagIds: 1 }, limit: MAX_OPS },
  );
  return txns.flatMap((t) => updateOp("transactions", t as unknown as Values & { _id: string }, { tagIds: [...new Set([...t.tagIds, ...rule.tagIds])] }) ?? []);
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

/** Paid + (for repeating bills, unless one already exists) the next occurrence. */
export async function planBillPaid(userId: string, billId: string): Promise<{ name: string; ops: ChangeOp[] }> {
  const db = repos(userId);
  const bill = await db.bills.byId(billId);
  if (!bill) throw new HttpError(404, "Bill not found");
  if (bill.status === "paid") throw new HttpError(409, "Already paid");
  const ops: ChangeOp[] = [updateOp("bills", bill as unknown as Values & { _id: string }, { status: "paid" })!];
  if (bill.recurrence !== "none" && bill.source !== "liability") {
    const dueDate = nextDue(bill.dueDate, bill.recurrence);
    if (!(await db.bills.findOne({ name: bill.name, dueDate }))) {
      ops.push(createOp("bills", newId(), { name: bill.name, amountCents: bill.amountCents ?? null, dueDate, source: bill.source, accountId: bill.accountId ?? null, status: "upcoming", recurrence: bill.recurrence, paidTransactionId: null }));
    }
  }
  return { name: bill.name, ops };
}

export const CLAIM_STATUS_LABEL: Record<string, string> = { draft: "Draft", submitted: "Submitted", in_review: "In review", approved: "Approved", paid: "Paid", denied: "Denied", closed: "Closed" };

/** New claim with its first timeline entry. */
export function planClaimCreate(c: Values & { title: string; status: Doc<"claims">["status"]; transactionIds?: string[]; documentIds?: string[] }) {
  const id = newId();
  const now = new Date();
  const op = createOp("claims", id, {
    ...c,
    transactionIds: c.transactionIds ?? [],
    documentIds: c.documentIds ?? [],
    timeline: [{ at: now, note: `Created as ${CLAIM_STATUS_LABEL[c.status]}` }],
    submittedAt: c.status === "draft" ? null : now,
  });
  return { id, op };
}

/** Claim edit; a status change or note also lands on its timeline (and sets submittedAt the first time). */
export function planClaimUpdate(claim: Doc<"claims">, patch: Values, note?: string | null): ChangeOp | null {
  const p: Values = { ...patch };
  const status = p.status as string | undefined;
  const changed = status && status !== claim.status;
  const n = note?.trim().slice(0, 300);
  if (changed || n) {
    const entry = [changed ? CLAIM_STATUS_LABEL[status] : null, n].filter(Boolean).join(": ");
    p.timeline = [...claim.timeline, { at: new Date(), note: entry }];
    if (changed && status !== "draft" && !claim.submittedAt) p.submittedAt = new Date();
  }
  return updateOp("claims", claim as unknown as Values & { _id: string }, p);
}
