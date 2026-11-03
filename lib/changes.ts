import "server-only";
import { HttpError } from "@/lib/api";
import { repos } from "@/lib/db/repos";
import type { Doc } from "@/lib/db/schemas";

/**
 * ChangeSets (CLAUDE.md §5): every user edit is a list of ops with before/after
 * values, so it can be applied once, reverted once, and audited. Only the fields
 * below can ever be written through a changeSet, whoever built it (UI or chat).
 */
export const EDITABLE = {
  transactions: ["description", "notes", "tagIds"],
  tags: ["name", "color", "parentId"],
  tagRules: ["field", "match", "pattern", "tagIds", "enabled"],
  bills: ["name", "amountCents", "dueDate", "source", "accountId", "status", "recurrence", "paidTransactionId", "archivedAt"],
  claims: ["title", "kind", "counterparty", "status", "claimedCents", "approvedCents", "paidCents", "submittedAt", "deadlineAt", "transactionIds", "documentIds", "timeline", "notes", "archivedAt"],
} as const;
export type Editable = keyof typeof EDITABLE;
/** Collections whose docs a changeSet may create or delete (transactions are only edited). */
const CREATABLE: Editable[] = ["tags", "tagRules", "bills", "claims", "transactions"];
/** Fields a create op may set when they differ from EDITABLE (imported or manual transactions only). */
const CREATE_FIELDS: Partial<Record<Editable, readonly string[]>> = {
  transactions: ["source", "date", "amountCents", "currency", "name", "merchant", "accountId", "description", "notes", "tagIds", "pending", "documentId"],
};
const fieldsFor = (c: Editable, kind: ChangeOp["kind"]) => (kind === "update" ? EDITABLE[c] : (CREATE_FIELDS[c] ?? EDITABLE[c]));
export const MAX_OPS = 1000;

type Values = Record<string, unknown>;
export interface ChangeOp {
  collection: Editable;
  docId: string;
  kind: "create" | "update" | "delete";
  before: Values | null;
  after: Values | null;
}
export type ChangeSet = Doc<"changeSets">;
export type Origin = ChangeSet["origin"];

/** null and undefined both mean "field not set"; dates compare by instant. */
const norm = (v: unknown): unknown =>
  v === undefined || v === null || v === "" ? null
  : v instanceof Date ? v.toISOString()
  : Array.isArray(v) ? v.map(norm)
  : v;
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

const dropNulls = (v: Values) => Object.fromEntries(Object.entries(v).filter(([, x]) => norm(x) !== null));

function pick(doc: Values, keys: readonly string[]): Values {
  const out: Values = {};
  for (const k of keys) out[k] = doc[k] ?? null;
  return out;
}

/** Update op for the fields in `patch` that actually change, or null if nothing changes. */
export function updateOp(collection: Editable, doc: Values & { _id: string }, patch: Values): ChangeOp | null {
  const keys = Object.keys(patch).filter((k) => !same(doc[k], patch[k]));
  if (!keys.length) return null;
  const after: Values = {};
  for (const k of keys) after[k] = norm(patch[k]) === null ? null : patch[k];
  return { collection, docId: doc._id, kind: "update", before: pick(doc, keys), after };
}

export function createOp(collection: Editable, docId: string, values: Values): ChangeOp {
  return { collection, docId, kind: "create", before: null, after: pick(values, fieldsFor(collection, "create")) };
}

export function deleteOp(collection: Editable, doc: Values & { _id: string }): ChangeOp {
  return { collection, docId: doc._id, kind: "delete", before: pick(doc, fieldsFor(collection, "delete")), after: null };
}

/** Rejects ops that touch anything outside EDITABLE. Runs on every apply and revert. */
export function validateOps(ops: ChangeOp[]) {
  if (ops.length > MAX_OPS) throw new HttpError(400, `Too many changes at once (max ${MAX_OPS})`);
  for (const op of ops) {
    if (!EDITABLE[op.collection]) throw new HttpError(400, `Cannot edit ${op.collection}`);
    const allowed: readonly string[] = fieldsFor(op.collection, op.kind);
    if (op.kind !== "update" && !CREATABLE.includes(op.collection)) throw new HttpError(400, `Cannot ${op.kind} ${op.collection}`);
    // Bank transactions are never created or deleted by a changeSet; only imported/manual ones are.
    if (op.collection === "transactions" && op.kind !== "update" && !["import", "manual"].includes((op.after ?? op.before)?.source as string)) {
      throw new HttpError(400, "Only imported or manual transactions can be added or removed");
    }
    for (const v of [op.before, op.after]) {
      for (const k of Object.keys(v ?? {})) if (!allowed.includes(k)) throw new HttpError(400, `Field ${k} is not editable`);
    }
  }
}

/**
 * Plays ops forward (apply) or backward (revert). Checks every target doc is
 * still in the expected state first, so a stale proposal or an undo after a
 * later edit fails cleanly instead of clobbering newer data.
 */
async function play(userId: string, ops: ChangeOp[], dir: "forward" | "back") {
  validateOps(ops);
  const db = repos(userId);
  const steps = ops.map((op) => {
    const expected = dir === "forward" ? op.before : op.after;
    const target = dir === "forward" ? op.after : op.before;
    const action =
      op.kind === "update" ? "update"
      : (op.kind === "create") === (dir === "forward") ? "insert"
      : "remove";
    return { op, expected, target, action } as const;
  });

  const byColl = new Map<Editable, typeof steps>();
  for (const s of steps) byColl.set(s.op.collection, [...(byColl.get(s.op.collection) ?? []), s]);

  for (const [coll, list] of byColl) {
    const current = await db[coll].find({ _id: { $in: list.map((s) => s.op.docId) } });
    const byId = new Map(current.map((d) => [d._id, d as unknown as Values]));
    for (const s of list) {
      const doc = byId.get(s.op.docId);
      if (s.action === "insert") {
        if (doc) throw new HttpError(409, "Something this change creates already exists");
        continue;
      }
      if (!doc) throw new HttpError(409, "Some records in this change no longer exist");
      for (const [k, v] of Object.entries(s.expected ?? {})) {
        if (!same(doc[k], v)) throw new HttpError(409, "Data changed since this was prepared. Ask again for a fresh proposal.");
      }
    }
  }

  for (const [coll, list] of byColl) {
    const repo = db[coll];
    const inserts = list.filter((s) => s.action === "insert");
    if (inserts.length) {
      await (repo.insertMany as (d: Values[]) => Promise<unknown>)(inserts.map((s) => ({ ...dropNulls(s.target ?? {}), _id: s.op.docId })));
    }
    const updates = list.filter((s) => s.action === "update").map((s) => {
      const $set: Values = {};
      const $unset: Record<string, ""> = {};
      for (const [k, v] of Object.entries(s.target ?? {})) {
        if (norm(v) === null && k !== "tagIds") $unset[k] = "";
        else $set[k] = k === "tagIds" && v === null ? [] : v;
      }
      return { filter: { _id: s.op.docId }, update: { $set, ...(Object.keys($unset).length ? { $unset } : {}) } };
    });
    if (updates.length) await repo.bulkUpdate(updates);
    const removes = list.filter((s) => s.action === "remove").map((s) => s.op.docId);
    if (removes.length) await repo.deleteMany({ _id: { $in: removes } });
  }
}

export async function createChangeSet(
  userId: string,
  { summary, origin, ops }: { summary: string; origin: Origin; ops: ChangeOp[] },
): Promise<ChangeSet> {
  validateOps(ops);
  if (!ops.length) throw new HttpError(400, "Nothing to change");
  return repos(userId).changeSets.insert({ summary: summary.slice(0, 300), origin, status: "proposed", ops });
}

async function load(userId: string, id: string) {
  const cs = await repos(userId).changeSets.byId(id);
  if (!cs) throw new HttpError(404, "Change not found");
  return cs;
}

async function audit(userId: string, action: string, cs: ChangeSet) {
  await repos(userId).auditLog.insert({ action, changeSetId: cs._id, detail: { summary: cs.summary, ops: cs.ops.length, origin: cs.origin } });
}

/** Moves status from → to only if it is still `from`, so a double tap applies once. */
async function claim(userId: string, id: string, from: ChangeSet["status"], to: ChangeSet["status"], at: Values) {
  const r = await repos(userId).changeSets.updateOne({ _id: id, status: from }, { $set: { status: to, ...at } });
  if (!r.matchedCount) throw new HttpError(409, `This change is not ${from} anymore`);
}

export async function applyChangeSet(userId: string, id: string) {
  const cs = await load(userId, id);
  if (cs.status !== "proposed") throw new HttpError(409, `This change was already ${cs.status}`);
  await claim(userId, id, "proposed", "applied", { appliedAt: new Date() });
  try {
    await play(userId, cs.ops as ChangeOp[], "forward");
  } catch (e) {
    await repos(userId).changeSets.updateOne({ _id: id }, { $set: { status: "proposed" }, $unset: { appliedAt: "" } });
    throw e;
  }
  await audit(userId, "changeSet.apply", cs);
  return { ...cs, status: "applied" as const };
}

export async function revertChangeSet(userId: string, id: string) {
  const cs = await load(userId, id);
  if (cs.status !== "applied") throw new HttpError(409, "Only applied changes can be undone");
  await claim(userId, id, "applied", "reverted", { revertedAt: new Date() });
  try {
    await play(userId, [...(cs.ops as ChangeOp[])].reverse(), "back");
  } catch (e) {
    await repos(userId).changeSets.updateOne({ _id: id }, { $set: { status: "applied" }, $unset: { revertedAt: "" } });
    throw e;
  }
  await audit(userId, "changeSet.revert", cs);
  return { ...cs, status: "reverted" as const };
}

export async function rejectChangeSet(userId: string, id: string) {
  const cs = await load(userId, id);
  await claim(userId, id, "proposed", "rejected", {});
  await audit(userId, "changeSet.reject", cs);
}

/** A direct user edit: create the changeSet and apply it right away. */
export async function commit(userId: string, summary: string, ops: ChangeOp[], origin: Origin = "user") {
  const cs = await createChangeSet(userId, { summary, origin, ops });
  await applyChangeSet(userId, cs._id);
  return cs._id;
}
