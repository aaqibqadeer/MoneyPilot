import { beforeAll, describe, expect, it } from "vitest";
import { autoTagNew, groupSuggestions, rulesOps } from "@/lib/autotag";
import { createOp, commit } from "@/lib/changes";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";
import { repos } from "@/lib/db/repos";

const tx = (id: string, merchant: string, tagIds: string[] = []) => ({ _id: id, name: merchant.toUpperCase(), merchant, description: undefined, category: undefined, amountCents: 1000, tagIds });

describe("auto-tag", () => {
  beforeAll(async () => {
    await ensureDemoUser();
  });

  it("applies enabled rules and skips broken regex", () => {
    const rules = [
      { field: "merchant" as const, match: "contains" as const, pattern: "uber", tagIds: ["t-transport"], enabled: true },
      { field: "name" as const, match: "regex" as const, pattern: "(", tagIds: ["x"], enabled: true },
      { field: "merchant" as const, match: "contains" as const, pattern: "lyft", tagIds: ["t-transport"], enabled: false },
    ];
    const ops = rulesOps(rules, [tx("a", "Uber Eats"), tx("b", "Lyft"), tx("c", "Uber", ["t-transport"])]);
    expect(ops.map((o) => [o.docId, o.after?.tagIds])).toEqual([["a", ["t-transport"]]]);
  });

  it("groups confident suggestions by tag, matching existing names", () => {
    const groups = groupSuggestions(
      [{ _id: "g1", name: "Groceries" }],
      [tx("a", "Aldi"), tx("b", "Costco"), tx("c", "Delta"), tx("d", "Mystery")],
      [
        { id: "a", tag: "groceries", confidence: 0.9 },
        { id: "b", tag: "Groceries", confidence: 0.7 },
        { id: "c", tag: "Travel", confidence: 0.8 },
        { id: "d", tag: "Travel", confidence: 0.3 },
        { id: "zz", tag: "Travel", confidence: 0.9 },
      ],
    );
    expect(groups.map((g) => [g.tag, g.isNew, g.count])).toEqual([["Groceries", false, 2], ["Travel", true, 1]]);
    expect(groups[0].confidence).toBeCloseTo(0.8);
  });

  it("autoTagNew applies rules as an undoable autotag change", async () => {
    const db = repos(DEMO_USER_ID);
    const t = (await db.transactions.findOne({ merchant: "Comcast" }))!;
    await commit(DEMO_USER_ID, "rule", [createOp("tagRules", "rule-comcast", { field: "merchant", match: "equals", pattern: "Comcast", tagIds: ["tag-utils"], enabled: true })]);
    expect(await autoTagNew(DEMO_USER_ID, [t._id])).toBe(1);
    expect((await db.transactions.byId(t._id))!.tagIds).toContain("tag-utils");
    expect(await db.changeSets.count({ origin: "autotag", status: "applied" })).toBe(1);
    expect(await autoTagNew(DEMO_USER_ID, [t._id])).toBe(0);
  });
});
