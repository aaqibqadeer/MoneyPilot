import { describe, expect, it } from "vitest";
import { removeItem } from "@/lib/bank/sync";
import { repos } from "@/lib/db/repos";

describe("removeItem", () => {
  it("deletes the bank's accounts, synced data and derived bills, keeps imports", async () => {
    const u = "remove-bank-user";
    const db = repos(u);
    const item = await db.items.insert({ provider: "plaid", providerItemId: "x", accessTokenEnc: "demo", institutionName: "Test Bank", status: "ok" });
    const other = await db.items.insert({ provider: "plaid", providerItemId: "y", accessTokenEnc: "demo", institutionName: "Other", status: "ok" });
    const acc = await db.accounts.insert({ itemId: item._id, providerAccountId: "a", name: "Card", type: "credit", currency: "USD" });
    const keep = await db.accounts.insert({ itemId: other._id, providerAccountId: "b", name: "Chk", type: "depository", currency: "USD" });
    const t = { date: new Date(), amountCents: 100, currency: "USD", name: "x", tagIds: [], pending: false };
    await db.transactions.insertMany([
      { ...t, accountId: acc._id, source: "plaid" },
      { ...t, accountId: acc._id, source: "import" },
      { ...t, accountId: keep._id, source: "plaid" },
    ]);
    await db.liabilities.insert({ accountId: acc._id, kind: "credit" });
    await db.bills.insertMany([
      { name: "Card", dueDate: new Date(), source: "liability", accountId: acc._id, status: "upcoming", recurrence: "none" },
      { name: "Rent", dueDate: new Date(), source: "manual", accountId: acc._id, status: "upcoming", recurrence: "monthly" },
    ]);

    expect(await removeItem(u, item._id)).toEqual({ institution: "Test Bank", transactions: 1 });
    expect(await db.items.count({})).toBe(1);
    expect(await db.accounts.count({})).toBe(1);
    expect(await db.transactions.count({})).toBe(2);
    expect(await db.transactions.count({ source: "import", accountId: { $exists: false } })).toBe(1);
    expect(await db.liabilities.count({})).toBe(0);
    expect((await db.bills.find({})).map((b) => b.name)).toEqual(["Rent"]);
    expect(await db.auditLog.count({ action: "bank.remove" })).toBe(1);
    await expect(removeItem(u, item._id)).rejects.toThrow(/not found/);
    await expect(removeItem("someone-else", other._id)).rejects.toThrow(/not found/);
  });
});
