import { describe, expect, it } from "vitest";
import { AnalyticsQueryError, buildScopedPipeline, MAX_RESULTS } from "@/lib/ai/analytics";
import { MemoryColl, memStore } from "@/lib/db/memory";

const U = "user-a";
const build = (c: string, p: unknown) => buildScopedPipeline(c, p, U);

describe("buildScopedPipeline", () => {
  it("forces a userId $match first and a $limit last", () => {
    const p = build("transactions", [{ $group: { _id: null, n: { $sum: 1 } } }]);
    expect(p[0]).toEqual({ $match: { userId: U } });
    expect(p.at(-1)).toEqual({ $limit: MAX_RESULTS });
  });

  it("hides raw provider data", () => {
    expect(build("transactions", [])[1]).toEqual({ $unset: ["raw", "accessTokenEnc"] });
  });

  it.each(["users", "sessions", "passkeys", "items", "chatMessages", "recoveryCodes", "magicLinks", "nope", "", 5])(
    "rejects collection %s",
    (c) => expect(() => buildScopedPipeline(c, [], U)).toThrow(AnalyticsQueryError),
  );

  it.each(["$out", "$merge", "$unionWith", "$graphLookup", "$collStats", "$indexStats", "$currentOp", "$documents"])(
    "rejects stage %s",
    (op) => expect(() => build("transactions", [{ [op]: {} }])).toThrow(AnalyticsQueryError),
  );

  it.each(["$where", "$function", "$accumulator"])("rejects %s nested anywhere", (op) => {
    expect(() => build("transactions", [{ $match: { $expr: { $and: [{ [op]: "x" }] } } }])).toThrow(AnalyticsQueryError);
    expect(() => build("transactions", [{ $group: { _id: null, v: { [op]: {} } } }])).toThrow(AnalyticsQueryError);
  });

  it("rejects $out hidden inside $facet", () => {
    expect(() => build("transactions", [{ $facet: { a: [{ $out: "x" }] } }])).toThrow(AnalyticsQueryError);
  });

  it("rejects malformed stages and pipelines", () => {
    expect(() => build("transactions", "nope")).toThrow();
    expect(() => build("transactions", [{ $match: {}, $limit: 1 }])).toThrow();
    expect(() => build("transactions", [[]])).toThrow();
    expect(() => build("transactions", Array.from({ length: 31 }, () => ({ $limit: 1 })))).toThrow();
  });

  it("requires a user", () => {
    expect(() => buildScopedPipeline("transactions", [], "")).toThrow();
  });

  it("scopes $lookup to the user and rejects foreign collections", () => {
    const p = build("transactions", [{ $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", as: "acct" } }]);
    const l = (p.find((s) => "$lookup" in s) as { $lookup: { pipeline: unknown[] } }).$lookup;
    expect(l.pipeline[0]).toEqual({ $match: { userId: U } });
    expect(() => build("transactions", [{ $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u" } }])).toThrow();
    expect(() => build("transactions", [{ $lookup: { from: "sessions", pipeline: [], as: "s" } }])).toThrow();
  });

  it("scopes nested $lookup pipelines and $facet branches", () => {
    const ok = build("transactions", [{ $lookup: { from: "tags", pipeline: [{ $match: { name: "Food" } }], as: "t" } }]);
    const inner = (ok.find((s) => "$lookup" in s) as { $lookup: { pipeline: unknown[] } }).$lookup.pipeline;
    expect(inner).toEqual([{ $match: { userId: U } }, { $match: { name: "Food" } }]);
    expect(() =>
      build("transactions", [{ $lookup: { from: "tags", pipeline: [{ $lookup: { from: "items", pipeline: [], as: "x" } }], as: "t" } }]),
    ).toThrow();
    const f = build("transactions", [{ $facet: { a: [{ $count: "n" }] } }]);
    expect(f.find((s) => "$facet" in s)).toEqual({ $facet: { a: [{ $count: "n" }] } });
  });

  it("converts ISO date strings and $date to Date", () => {
    const p = build("transactions", [{ $match: { date: { $gte: "2026-10-01", $lt: { $date: "2026-11-01T00:00:00Z" } } } }]);
    const m = (p.find((s) => "$match" in s && "date" in (s.$match as object)) as { $match: { date: { $gte: Date; $lt: Date } } }).$match;
    expect(m.date.$gte).toBeInstanceOf(Date);
    expect(m.date.$lt).toBeInstanceOf(Date);
  });
});

describe("scoped pipeline against data (mingo)", () => {
  it("never returns another user's rows, even when the model asks for them", async () => {
    memStore.set("transactions", [
      { _id: "1", userId: U, amountCents: 100 },
      { _id: "2", userId: "user-b", amountCents: 999 },
    ]);
    memStore.set("accounts", [
      { _id: "a1", userId: U, name: "Mine" },
      { _id: "a2", userId: "user-b", name: "Theirs" },
    ]);
    const c = new MemoryColl("transactions");
    const sneaky = [
      { $match: { $or: [{ userId: "user-b" }, { userId: { $exists: true } }] } },
      { $lookup: { from: "accounts", pipeline: [], as: "accts" } },
      { $group: { _id: null, total: { $sum: "$amountCents" }, accts: { $push: "$accts.name" } } },
    ];
    const [row] = await c.aggregate<{ total: number; accts: string[][] }>(build("transactions", sneaky));
    expect(row.total).toBe(100);
    expect(row.accts.flat()).toEqual(["Mine"]);
  });
});
