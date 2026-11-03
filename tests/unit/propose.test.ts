import { beforeAll, describe, expect, it } from "vitest";
import { writeTools } from "@/lib/ai/write-tools";
import { applyChangeSet, revertChangeSet } from "@/lib/changes";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";
import { repos } from "@/lib/db/repos";

type Exec = (input: unknown, opts?: unknown) => Promise<Record<string, unknown>>;
const propose = (input: unknown) =>
  (writeTools(DEMO_USER_ID).proposeChanges as unknown as { execute: Exec }).execute(input, { toolCallId: "t", messages: [] });
const db = () => repos(DEMO_USER_ID);

describe("proposeChanges", () => {
  beforeAll(async () => {
    await ensureDemoUser();
  });

  it("only proposes; applying tags matches and creates the new tag, undo restores", async () => {
    const uber = await db().transactions.find({ merchant: "Uber", deletedAt: { $exists: false } });
    const r = (await propose({ summary: "Tag Uber as Rides", edits: [{ where: { query: "uber" }, addTags: ["Rides"] }] })) as {
      changeSetId: string; counts: { transactions: number; newTags: number }; preview: { changes: string[] }[];
    };
    expect(r.counts).toMatchObject({ transactions: uber.length, newTags: 1 });
    expect(r.preview[0].changes).toContain("+Rides");
    expect(await db().tags.findOne({ name: "Rides" })).toBeNull();
    expect((await db().changeSets.byId(r.changeSetId))!.status).toBe("proposed");

    await applyChangeSet(DEMO_USER_ID, r.changeSetId);
    const tag = (await db().tags.findOne({ name: "Rides" }))!;
    expect(await db().transactions.count({ tagIds: tag._id })).toBe(uber.length);
    await revertChangeSet(DEMO_USER_ID, r.changeSetId);
    expect(await db().tags.findOne({ name: "Rides" })).toBeNull();
    expect(await db().transactions.count({ tagIds: tag._id })).toBe(0);
  });

  it("merges a rule with an edit on the same transaction without dropping tags", async () => {
    const t = (await db().transactions.findOne({ merchant: "Shell", deletedAt: { $exists: false } }))!;
    const r = (await propose({
      summary: "Gas",
      edits: [{ transactionIds: [t._id], notes: "road trip" }],
      rules: [{ pattern: "shell", tags: ["Gas"] }],
    })) as { changeSetId: string };
    await applyChangeSet(DEMO_USER_ID, r.changeSetId);
    const now = (await db().transactions.byId(t._id))!;
    const gas = (await db().tags.findOne({ name: "Gas" }))!;
    expect(now.notes).toBe("road trip");
    expect(now.tagIds).toEqual([...t.tagIds, gas._id]);
    expect(await db().tagRules.count({ pattern: "shell" })).toBe(1);
  });

  it("reports no-ops and bad input as errors", async () => {
    expect((await propose({ summary: "noop", edits: [{ where: { query: "zzz-no-match" }, notes: "x" }] })).error).toBeTruthy();
    expect((await propose({ summary: "bad", rules: [{ match: "regex", pattern: "(", tags: ["X"] }] })).error).toMatch(/regular expression/);
  });

  it("creates a claim, then updates and archives it; undo restores", async () => {
    const t = (await db().transactions.findOne({ merchant: "Uber", deletedAt: { $exists: false } }))!;
    const r = (await propose({ summary: "Add dental claim", claims: [{ title: "Dental cleaning", kind: "insurance", counterparty: "Delta Dental", claimed: 120.5, transactionIds: [t._id, "not-mine"] }] })) as { changeSetId: string; records: { type: string; action: string; changes: string[] }[] };
    expect(r.records[0]).toMatchObject({ type: "claim", action: "add" });
    expect(r.records[0].changes).toContain("claimed: $120.50");
    await applyChangeSet(DEMO_USER_ID, r.changeSetId);
    const claim = (await db().claims.findOne({ title: "Dental cleaning" }))!;
    expect(claim).toMatchObject({ status: "draft", claimedCents: 12050, transactionIds: [t._id] });

    const u = (await propose({ summary: "Submitted", claims: [{ id: claim._id, status: "submitted", timelineNote: "Sent by email" }] })) as { changeSetId: string };
    await applyChangeSet(DEMO_USER_ID, u.changeSetId);
    const sub = (await db().claims.byId(claim._id))!;
    expect(sub.status).toBe("submitted");
    expect(sub.submittedAt).toBeInstanceOf(Date);
    expect(sub.timeline.at(-1)!.note).toBe("Submitted: Sent by email");

    const a = (await propose({ summary: "Archive", claims: [{ id: claim._id, archive: true }] })) as { changeSetId: string; records: { action: string }[] };
    expect(a.records[0].action).toBe("archive");
    await applyChangeSet(DEMO_USER_ID, a.changeSetId);
    expect((await db().claims.byId(claim._id))!.archivedAt).toBeInstanceOf(Date);
    await revertChangeSet(DEMO_USER_ID, a.changeSetId);
    expect((await db().claims.byId(claim._id))!.archivedAt).toBeUndefined();
  });

  it("adds a bill and marks it paid with the next occurrence", async () => {
    const r = (await propose({ summary: "Gym", bills: [{ name: "Gym membership", amount: 40, dueDate: "2026-11-15", recurrence: "monthly" }] })) as { changeSetId: string };
    await applyChangeSet(DEMO_USER_ID, r.changeSetId);
    const bill = (await db().bills.findOne({ name: "Gym membership" }))!;
    expect(bill).toMatchObject({ amountCents: 4000, source: "manual", status: "upcoming" });
    const p = (await propose({ summary: "Paid gym", bills: [{ id: bill._id, status: "paid", amount: 45 }] })) as { changeSetId: string };
    await applyChangeSet(DEMO_USER_ID, p.changeSetId);
    expect(await db().bills.byId(bill._id)).toMatchObject({ status: "paid", amountCents: 4500 });
    expect(await db().bills.count({ name: "Gym membership", status: "upcoming" })).toBe(1);
    await revertChangeSet(DEMO_USER_ID, p.changeSetId);
    expect(await db().bills.byId(bill._id)).toMatchObject({ status: "upcoming", amountCents: 4000 });
    expect(await db().bills.count({ name: "Gym membership" })).toBe(1);
  });

  it("adds manual transactions, switches rules off and renames tags", async () => {
    const rule = (await db().tagRules.findOne({}))!;
    const tag = (await db().tags.findOne({}))!;
    const r = (await propose({
      summary: "Misc",
      newTransactions: [{ date: "2026-10-30", amount: 12.34, name: "Farmers market", tags: ["Cash"] }],
      ruleUpdates: [{ id: rule._id, enabled: false }],
      tagUpdates: [{ id: tag._id, name: `${tag.name} 2` }],
    })) as { changeSetId: string; newTags: string[] };
    expect(r.newTags).toEqual(["Cash"]);
    await applyChangeSet(DEMO_USER_ID, r.changeSetId);
    const txn = (await db().transactions.findOne({ name: "Farmers market" }))!;
    expect(txn).toMatchObject({ source: "manual", amountCents: 1234 });
    expect((await db().tagRules.byId(rule._id))!.enabled).toBe(false);
    expect((await db().tags.byId(tag._id))!.name).toBe(`${tag.name} 2`);
    await revertChangeSet(DEMO_USER_ID, r.changeSetId);
    expect(await db().transactions.findOne({ name: "Farmers market" })).toBeNull();
    expect((await db().tagRules.byId(rule._id))!.enabled).toBe(rule.enabled);
  });

  it("rejects unknown ids and incomplete new records", async () => {
    expect((await propose({ summary: "bad input", claims: [{ id: "nope", status: "paid" }] })).error).toMatch(/Unknown claim/);
    expect((await propose({ summary: "bad input", bills: [{ name: "No date" }] })).error).toMatch(/due date/);
    expect((await propose({ summary: "bad input", newTransactions: [{ date: "2026-10-01", amount: 5, name: "x", accountId: "nope" }] })).error).toMatch(/Unknown account/);
  });
});
