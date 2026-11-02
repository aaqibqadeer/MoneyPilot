import { beforeAll, describe, expect, it } from "vitest";
import { readTools } from "@/lib/ai/tools";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";

type Exec = (input: unknown, opts?: unknown) => Promise<unknown>;
const run = async (name: keyof ReturnType<typeof readTools>, input: unknown) =>
  (readTools(DEMO_USER_ID)[name] as unknown as { execute: Exec }).execute(input, { toolCallId: "t", messages: [] });

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const from = iso(new Date(today.getTime() - 60 * 86400000));
const to = iso(today);

describe("read tools on demo data", () => {
  beforeAll(async () => {
    await ensureDemoUser();
  });

  it("lists accounts", async () => {
    const r = (await run("getAccounts", {})) as { name: string }[];
    expect(r.map((a) => a.name)).toContain("Rewards Card");
  });

  it.each(["tag", "category", "merchant", "account", "month", "week", "none"])("summarizes spending by %s", async (groupBy) => {
    const r = (await run("getSpendingSummary", { from, to, groupBy, direction: "spend", includeTransfers: false, limit: 10 })) as {
      groups: { group: string; total: number }[];
      grandTotal: number;
    };
    expect(r.groups.length).toBeGreaterThan(0);
    expect(r.grandTotal).toBeGreaterThan(0);
  });

  it("searches transactions by tag", async () => {
    const r = (await run("searchTransactions", { tag: "Restaurants", limit: 5 })) as { total: number; transactions: { tags: string[] }[] };
    expect(r.total).toBeGreaterThan(0);
    expect(r.transactions.every((t) => t.tags.includes("Restaurants"))).toBe(true);
  });

  it("returns liabilities and bills", async () => {
    expect(((await run("getLiabilities", {})) as unknown[]).length).toBe(1);
    expect(((await run("getBills", {})) as unknown[]).length).toBeGreaterThan(0);
  });

  it("runs a scoped analytics query and reports blocked ones as errors", async () => {
    const ok = (await run("runAnalyticsQuery", { collection: "transactions", pipeline: [{ $group: { _id: "$category", n: { $sum: 1 } } }] })) as { rows: unknown[] };
    expect(ok.rows.length).toBeGreaterThan(0);
    const bad = (await run("runAnalyticsQuery", { collection: "transactions", pipeline: [{ $out: "x" }] })) as { error: string };
    expect(bad.error).toMatch(/not allowed/);
  });
});
