import { beforeAll, describe, expect, it } from "vitest";
import { commit, createOp, revertChangeSet } from "@/lib/changes";
import { detectRecurring, merchantKey } from "@/lib/bills/recurring";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";
import { repos } from "@/lib/db/repos";
import { planBillPaid } from "@/lib/edits";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const now = d("2026-11-02");

describe("detectRecurring", () => {
  it("finds monthly and weekly charges, skips irregular ones", () => {
    const tx = (key: string, date: string, cents: number) => ({ key, label: key, date: d(date), amountCents: cents });
    const out = detectRecurring([
      tx("netflix", "2026-08-09", 1549), tx("netflix", "2026-09-09", 1549), tx("netflix", "2026-10-09", 1549),
      tx("gym", "2026-10-12", 2000), tx("gym", "2026-10-19", 2000), tx("gym", "2026-10-26", 2100),
      tx("amazon", "2026-08-01", 1200), tx("amazon", "2026-08-04", 9000), tx("amazon", "2026-10-20", 3000),
      tx("old", "2026-01-01", 500), tx("old", "2026-02-01", 500), tx("old", "2026-03-01", 500),
    ], now);
    expect(out.map((c) => [c.key, c.recurrence])).toEqual([["gym", "weekly"], ["netflix", "monthly"]]);
    expect(out.find((c) => c.key === "netflix")!.nextDate.toISOString().slice(0, 10)).toBe("2026-11-09");
  });

  it("reports the account of the latest charge", () => {
    const now = new Date("2026-06-20");
    const t = (d: string, accountId: string) => ({ key: "netflix", label: "Netflix", date: new Date(d), amountCents: 1599, accountId });
    const [c] = detectRecurring([t("2026-03-15", "old"), t("2026-04-15", "old"), t("2026-05-15", "card")], now);
    expect(c.accountId).toBe("card");
  });

  it("normalizes merchant keys", () => expect(merchantKey("SPOTIFY USA #1234")).toBe("spotify usa"));
});

describe("bills changeSets", () => {
  beforeAll(async () => {
    await ensureDemoUser();
  });

  it("paying a monthly bill creates the next one, and undo removes it", async () => {
    const db = repos(DEMO_USER_ID).bills;
    const id = "bill-water";
    await commit(DEMO_USER_ID, "add", [createOp("bills", id, { name: "Water", amountCents: 4000, dueDate: d("2026-11-05"), recurrence: "monthly", source: "manual", status: "upcoming" })]);
    const { ops } = await planBillPaid(DEMO_USER_ID, id);
    expect(ops).toHaveLength(2);
    const cs = await commit(DEMO_USER_ID, "paid", ops);
    expect((await db.byId(id))!.status).toBe("paid");
    expect(await db.count({ name: "Water" })).toBe(2);
    await revertChangeSet(DEMO_USER_ID, cs);
    expect((await db.byId(id))!.status).toBe("upcoming");
    expect(await db.count({ name: "Water" })).toBe(1);
    await expect(planBillPaid(DEMO_USER_ID, "nope")).rejects.toThrow(/not found/);
  });
});
