import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";
import { monthKey, monthlyFlow, monthReport } from "@/lib/insights";
import { aiUsage } from "@/lib/queries";

describe("insights", () => {
  beforeAll(async () => {
    await ensureDemoUser();
  });

  it("returns 12 months oldest first with income and spend", async () => {
    const flow = await monthlyFlow(DEMO_USER_ID);
    expect(flow).toHaveLength(12);
    expect(flow.at(-1)!.month).toBe(monthKey(new Date()));
    const prev = flow.at(-2)!;
    expect(prev.income).toBeGreaterThan(0);
    expect(prev.spend).toBeGreaterThan(0);
  });

  it("builds a month report with tags vs last month and merchants", async () => {
    const flow = await monthlyFlow(DEMO_USER_ID);
    const r = await monthReport(DEMO_USER_ID, flow.at(-2)!.month);
    expect(r.spend).toBe(flow.at(-2)!.spend);
    expect(r.net).toBe(r.income - r.spend);
    expect(r.tags.some((t) => t.name === "Groceries")).toBe(true);
    expect(r.merchants[0].total).toBeGreaterThanOrEqual(r.merchants.at(-1)!.total);
    expect(r.biggest?.amountCents).toBeGreaterThan(0);
  });

  it("sums AI usage", async () => {
    expect(await aiUsage(DEMO_USER_ID)).toMatchObject({ month: { tokens: expect.any(Number) }, all: { tokens: expect.any(Number) } });
  });
});
