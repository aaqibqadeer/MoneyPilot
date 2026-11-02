import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { createChangeSet, createOp, MAX_OPS, type ChangeOp } from "@/lib/changes";
import { newId } from "@/lib/db/client";
import { repos } from "@/lib/db/repos";
import { planRuleApply, planTagCreate, planTransactionEdits, ruleRegex, type TxnEdit } from "@/lib/edits";
import { txnFilter } from "./tools";

const isoDate = z.string().describe("ISO date, e.g. 2026-10-01");
const tagNames = z.array(z.string().min(1).max(40)).max(10);
const where = z.object({
  query: z.string().optional().describe("Text in name, merchant, description or notes"),
  from: isoDate.optional(),
  to: isoDate.optional().describe("Inclusive end date"),
  accountId: z.string().optional(),
  tag: z.string().optional().describe('Tag name, or "untagged"'),
  category: z.string().optional(),
  minAmount: z.number().optional().describe("Dollars; positive = money out"),
  maxAmount: z.number().optional(),
});

export const proposeInput = z.object({
  summary: z.string().min(3).max(200).describe("One line the user will see, e.g. 'Tag 12 Uber rides as Transport'"),
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
        "Propose edits to transactions (description, notes, add/remove tags), new tags, and tag rules. Nothing changes until the user taps Apply on the card shown in chat. Use searchTransactions first to find ids, or pass a `where` filter for bulk edits. Afterwards tell the user to review and apply; never say it is done.",
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

async function propose(userId: string, db: ReturnType<typeof repos>, input: z.infer<typeof proposeInput>) {
  if (!input.edits.length && !input.rules.length) return { error: "Nothing to change" };
  const existing = await db.tags.find({});
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t._id]));
  const names = new Map(existing.map((t) => [t._id, t.name]));
  const ops: ChangeOp[] = [];
  const created: string[] = [];

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

  const edits: TxnEdit[] = [];
  for (const e of input.edits) {
    let ids = e.transactionIds ?? [];
    if (e.where) {
      const found = await db.transactions.find(txnFilter(e.where, byName), { projection: { _id: 1 }, limit: MAX_OPS + 1 });
      if (found.length > MAX_OPS) return { error: `That filter matches more than ${MAX_OPS} transactions. Narrow it down.` };
      ids = [...ids, ...found.map((t) => t._id)];
    }
    if (!ids.length) continue;
    edits.push({ ids, description: e.description, notes: e.notes, addTagIds: tagIds(e.addTags, true), removeTagIds: tagIds(e.removeTags, false) });
  }
  const txnOps = await planTransactionEdits(userId, edits);

  const ruleOps: ChangeOp[] = [];
  for (const r of input.rules) {
    const rule = { field: r.field, match: r.match, pattern: r.pattern.trim(), tagIds: tagIds(r.tags, true) };
    ruleRegex(rule);
    ruleOps.push(createOp("tagRules", newId(), { ...rule, enabled: true }));
    if (r.applyToExisting) {
      // merge with edits already planned for the same transaction
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
  ops.push(...txnOps, ...ruleOps);
  if (!txnOps.length && !ruleOps.length) return { error: "Nothing would change: the transactions already look like that." };

  const cs = await createChangeSet(userId, { summary: input.summary, origin: "chat", ops });
  const sample = await db.transactions.find({ _id: { $in: txnOps.slice(0, 15).map((o) => o.docId) } }, { projection: { date: 1, name: 1, merchant: 1, description: 1, amountCents: 1 } });
  const tagLabel = (ids: unknown) => ((ids as string[] | null) ?? []).map((id) => names.get(id) ?? "?");

  return {
    changeSetId: cs._id,
    status: "proposed" as const,
    summary: cs.summary,
    counts: { transactions: txnOps.length, newTags: created.length, rules: ruleOps.length },
    newTags: created,
    rules: input.rules.map((r) => `${r.field} ${r.match} "${r.pattern}" → ${r.tags.join(", ")}`),
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
