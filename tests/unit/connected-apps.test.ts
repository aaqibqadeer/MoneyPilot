import { describe, expect, it } from "vitest";
import { readTools } from "@/lib/ai/tools";
import { bankAccessGuide, detectApps, matchApp } from "@/lib/bank/connected-apps";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("connected apps", () => {
  it("matches app names and ignores lookalikes", () => {
    expect(matchApp("PAYPAL *NETFLIX")?.name).toBe("PayPal");
    expect(matchApp("Credit Karma Money transfer")?.name).toBe("Credit Karma");
    expect(matchApp("SQUARE CASH 123")?.name).toBe("Cash App");
    expect(matchApp("STARBUCKS #12")).toBeUndefined();
    expect(matchApp("CHIMES BAKERY")).toBeUndefined();
  });

  it("groups by account and app, newest first", () => {
    const out = detectApps([
      { accountId: "a", name: "VENMO PAYMENT", date: d("2026-09-01") },
      { accountId: "a", name: "VENMO CASHOUT", date: d("2026-10-01") },
      { accountId: "a", name: "ROBINHOOD DEBITS", date: d("2026-08-01") },
      { accountId: "b", name: "GROCERY", date: d("2026-10-01") },
      { name: "VENMO", date: d("2026-10-01") },
    ]);
    expect(out.a.map((x) => [x.name, x.count])).toEqual([["Venmo", 2], ["Robinhood", 1]]);
    expect(out.a[0].lastSeen).toEqual(d("2026-10-01"));
    expect(out.b).toBeUndefined();
  });

  it("names the bank's connected-apps page", () => {
    expect(bankAccessGuide("Chase").url).toContain("chase.com");
    expect(bankAccessGuide("Citizens Bank").url).toBe("");
    expect(bankAccessGuide("Citibank Online").url).toContain("citi.com");
  });

  it("chat tool finds demo apps", async () => {
    await ensureDemoUser();
    const r = (await (readTools(DEMO_USER_ID).getConnectedApps as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute({}, { toolCallId: "t", messages: [] })) as {
      banks: { accounts: { account: string; appsSeen: { app: string }[] }[] }[];
    };
    const checking = r.banks.flatMap((b) => b.accounts).find((a) => a.account === "Everyday Checking")!;
    expect(checking.appsSeen.map((a) => a.app).sort()).toEqual(["Robinhood", "Venmo"]);
  });
});
