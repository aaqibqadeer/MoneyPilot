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
});
