"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/api";
import { applyChangeSet, commit, createOp, deleteOp, rejectChangeSet, revertChangeSet, updateOp } from "@/lib/changes";
import { newId } from "@/lib/db/client";
import { repos } from "@/lib/db/repos";
import { escapeRx, planRuleApply, planTagCreate, planTagDelete, planTransactionEdits, ruleRegex } from "@/lib/edits";

/** Server actions for user edits. Every write goes through a changeSet (undoable, audited). */

export type ActionResult = { ok: true; changeSetId?: string; count?: number; id?: string } | { ok: false; error: string };

async function run(fn: (userId: string) => Promise<Omit<Extract<ActionResult, { ok: true }>, "ok">>, refreshPage = true): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const r = await fn(user._id);
    if (refreshPage) refresh();
    return { ok: true, ...r };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (e instanceof z.ZodError) return { ok: false, error: "Invalid input" };
    if (status && status < 500) return { ok: false, error: (e as Error).message };
    console.error("[edits]", (e as Error).message);
    return { ok: false, error: "Something went wrong" };
  }
}

const idSchema = z.string().min(1).max(100);
const ids = z.array(idSchema).min(1).max(1000);
const text = z.string().max(500).nullable().optional();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export async function saveTransaction(id: string, input: { description?: string | null; notes?: string | null; tagIds?: string[] }) {
  return run(async (userId) => {
    const i = z.object({ description: text, notes: text, tagIds: z.array(idSchema).max(50).optional() }).parse(input);
    const ops = await planTransactionEdits(userId, [{ ids: [idSchema.parse(id)], description: i.description, notes: i.notes, setTagIds: i.tagIds }]);
    if (!ops.length) return {};
    return { changeSetId: await commit(userId, "Edited a transaction", ops) };
  });
}

export async function bulkTag(txnIds: string[], add: string[], remove: string[]) {
  return run(async (userId) => {
    const ops = await planTransactionEdits(userId, [{ ids: ids.parse(txnIds), addTagIds: z.array(idSchema).parse(add), removeTagIds: z.array(idSchema).parse(remove) }]);
    if (!ops.length) return { count: 0 };
    return { changeSetId: await commit(userId, `Retagged ${ops.length} transaction${ops.length === 1 ? "" : "s"}`, ops), count: ops.length };
  });
}

export async function createTag(name: string, tagColor?: string) {
  return run(async (userId) => {
    const n = z.string().trim().min(1).max(40).parse(name);
    if (await repos(userId).tags.findOne({ name: { $regex: `^${escapeRx(n)}$`, $options: "i" } })) {
      throw new HttpError(409, "A tag with that name exists");
    }
    const { id, op } = planTagCreate(n, tagColor ? color.parse(tagColor) : undefined);
    return { id, changeSetId: await commit(userId, `Created tag ${n}`, [op]) };
  });
}

export async function updateTag(id: string, input: { name?: string; color?: string }) {
  return run(async (userId) => {
    const i = z.object({ name: z.string().trim().min(1).max(40).optional(), color: color.optional() }).parse(input);
    const tag = await repos(userId).tags.byId(idSchema.parse(id));
    if (!tag) throw new HttpError(404, "Tag not found");
    const op = updateOp("tags", tag as never, i);
    return op ? { changeSetId: await commit(userId, `Edited tag ${i.name ?? tag.name}`, [op]) } : {};
  });
}

export async function deleteTag(id: string) {
  return run(async (userId) => {
    const ops = await planTagDelete(userId, idSchema.parse(id));
    const name = (ops[0].before?.name as string) ?? "tag";
    return { changeSetId: await commit(userId, `Deleted tag ${name}`, ops), count: ops.length - 1 };
  });
}

const ruleInput = z.object({
  field: z.enum(["name", "merchant", "description"]),
  match: z.enum(["contains", "equals", "regex"]),
  pattern: z.string().trim().min(1).max(200),
  tagIds: z.array(idSchema).min(1).max(10),
});

/** Creates a rule and, when asked, tags existing matches in the same undoable change. */
export async function createRule(input: z.input<typeof ruleInput>, applyNow: boolean) {
  return run(async (userId) => {
    const r = ruleInput.parse(input);
    ruleRegex(r);
    const id = newId();
    const ops = [createOp("tagRules", id, { ...r, enabled: true }), ...(applyNow ? await planRuleApply(userId, r) : [])];
    return { id, changeSetId: await commit(userId, `Added rule "${r.pattern}"`, ops), count: ops.length - 1 };
  });
}

export async function setRuleEnabled(id: string, enabled: boolean) {
  return run(async (userId) => {
    const rule = await repos(userId).tagRules.byId(idSchema.parse(id));
    if (!rule) throw new HttpError(404, "Rule not found");
    const op = updateOp("tagRules", rule as never, { enabled });
    return op ? { changeSetId: await commit(userId, `${enabled ? "Enabled" : "Disabled"} rule "${rule.pattern}"`, [op]) } : {};
  });
}

export async function deleteRule(id: string) {
  return run(async (userId) => {
    const rule = await repos(userId).tagRules.byId(idSchema.parse(id));
    if (!rule) throw new HttpError(404, "Rule not found");
    return { changeSetId: await commit(userId, `Deleted rule "${rule.pattern}"`, [deleteOp("tagRules", rule as never)]) };
  });
}

export async function applyRule(id: string) {
  return run(async (userId) => {
    const rule = await repos(userId).tagRules.byId(idSchema.parse(id));
    if (!rule) throw new HttpError(404, "Rule not found");
    const ops = await planRuleApply(userId, rule);
    if (!ops.length) return { count: 0 };
    return { changeSetId: await commit(userId, `Applied rule "${rule.pattern}" to ${ops.length} transactions`, ops), count: ops.length };
  });
}

/** `refreshPage: false` from the chat card: a router refresh would remount the live chat. */
export async function applyChange(id: string, refreshPage = true) {
  return run(async (userId) => ({ changeSetId: (await applyChangeSet(userId, idSchema.parse(id)))._id }), refreshPage);
}

export async function rejectChange(id: string, refreshPage = true) {
  return run(async (userId) => {
    await rejectChangeSet(userId, idSchema.parse(id));
    return {};
  }, refreshPage);
}

export async function undoChange(id: string, refreshPage = true) {
  return run(async (userId) => ({ changeSetId: (await revertChangeSet(userId, idSchema.parse(id)))._id }), refreshPage);
}

/** Current status of a changeSet, for chat proposal cards loaded from history. */
export async function changeStatus(id: string) {
  const user = await requireUser();
  const cs = await repos(user._id).changeSets.findOne({ _id: idSchema.parse(id) });
  return cs?.status ?? null;
}
