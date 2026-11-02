import { beforeAll, describe, expect, it } from "vitest";
import { applyChangeSet, commit, createChangeSet, rejectChangeSet, revertChangeSet, updateOp, validateOps, type ChangeOp } from "@/lib/changes";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";
import { repos } from "@/lib/db/repos";
import { planRuleApply, planTagCreate, planTagDelete, planTransactionEdits } from "@/lib/edits";

const db = () => repos(DEMO_USER_ID);
const txn = async (merchant: string) => (await db().transactions.findOne({ merchant, deletedAt: { $exists: false } }))!;

describe("changeSets", () => {
  beforeAll(async () => {
    await ensureDemoUser();
  });

  it("applies and reverts a transaction edit, with an audit trail", async () => {
    const t = await txn("Chipotle");
    const ops = await planTransactionEdits(DEMO_USER_ID, [{ ids: [t._id], description: "Lunch", notes: "team", addTagIds: ["x-tag"] }]);
    expect(ops).toHaveLength(1);
    const id = await commit(DEMO_USER_ID, "edit", ops);
    let now = (await db().transactions.byId(t._id))!;
    expect(now.description).toBe("Lunch");
    expect(now.tagIds).toEqual([...t.tagIds, "x-tag"]);

    await revertChangeSet(DEMO_USER_ID, id);
    now = (await db().transactions.byId(t._id))!;
    expect(now.description).toBeUndefined();
    expect(now.notes).toBeUndefined();
    expect(now.tagIds).toEqual(t.tagIds);
    expect((await db().changeSets.byId(id))!.status).toBe("reverted");
    expect(await db().auditLog.count({ changeSetId: id })).toBe(2);
    await expect(revertChangeSet(DEMO_USER_ID, id)).rejects.toThrow(/Only applied/);
  });

  it("refuses to apply a stale proposal or undo over a newer edit", async () => {
    const t = await txn("Starbucks");
    const stale = await createChangeSet(DEMO_USER_ID, { summary: "s", origin: "chat", ops: await planTransactionEdits(DEMO_USER_ID, [{ ids: [t._id], notes: "a" }]) });
    const first = await commit(DEMO_USER_ID, "b", await planTransactionEdits(DEMO_USER_ID, [{ ids: [t._id], notes: "b" }]));
    await expect(applyChangeSet(DEMO_USER_ID, stale._id)).rejects.toThrow(/changed/);
    expect((await db().changeSets.byId(stale._id))!.status).toBe("proposed");
    await commit(DEMO_USER_ID, "c", await planTransactionEdits(DEMO_USER_ID, [{ ids: [t._id], notes: "c" }]));
    await expect(revertChangeSet(DEMO_USER_ID, first)).rejects.toThrow(/changed/);
    await rejectChangeSet(DEMO_USER_ID, stale._id);
    await expect(applyChangeSet(DEMO_USER_ID, stale._id)).rejects.toThrow(/rejected/);
  });

  it("only lets whitelisted fields through", () => {
    const bad: ChangeOp = { collection: "transactions", docId: "1", kind: "update", before: { amountCents: 1 }, after: { amountCents: 2 } };
    expect(() => validateOps([bad])).toThrow(/not editable/);
    expect(() => validateOps([{ ...bad, collection: "users" as never }])).toThrow(/Cannot edit/);
    expect(() => validateOps([{ collection: "transactions", docId: "1", kind: "delete", before: {}, after: null }])).toThrow(/Only imported or manual/);
    expect(() => validateOps([{ collection: "transactions", docId: "1", kind: "create", before: null, after: { source: "import", date: new Date(), amountCents: 5, name: "x" } }])).not.toThrow();
    expect(() => validateOps([{ collection: "transactions", docId: "1", kind: "create", before: null, after: { source: "plaid", name: "x" } }])).toThrow(/Only imported/);
    expect(updateOp("transactions", { _id: "1", notes: "x" }, { notes: "x" })).toBeNull();
  });

  it("creates a tag and a rule, tags matches, then deleting the tag is undoable", async () => {
    const { id: tagId, op } = planTagCreate("Coffee");
    await commit(DEMO_USER_ID, "tag", [op]);
    const rule = { field: "merchant" as const, match: "contains" as const, pattern: "starb", tagIds: [tagId] };
    const ops = await planRuleApply(DEMO_USER_ID, rule);
    const starbucks = await db().transactions.count({ merchant: "Starbucks", deletedAt: { $exists: false } });
    expect(ops).toHaveLength(starbucks);
    await commit(DEMO_USER_ID, "rule", ops);
    expect(await db().transactions.count({ tagIds: tagId })).toBe(starbucks);
    expect(await planRuleApply(DEMO_USER_ID, rule)).toHaveLength(0);

    const del = await commit(DEMO_USER_ID, "delete", await planTagDelete(DEMO_USER_ID, tagId));
    expect(await db().tags.byId(tagId)).toBeNull();
    expect(await db().transactions.count({ tagIds: tagId })).toBe(0);
    await revertChangeSet(DEMO_USER_ID, del);
    expect((await db().tags.byId(tagId))?.name).toBe("Coffee");
    expect(await db().transactions.count({ tagIds: tagId })).toBe(starbucks);
  });
});
