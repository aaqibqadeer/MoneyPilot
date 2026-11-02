import { describe, expect, it } from "vitest";
import { archiveItem, syncUser } from "@/lib/bank/sync";
import { repos } from "@/lib/db/repos";
import { dashboardSummary } from "@/lib/queries";

describe("archiveItem", () => {
  it("archives a bank without deleting anything and stops it syncing", async () => {
    const u = "archive-bank-user";
    const db = repos(u);
    const item = await db.items.insert({ provider: "plaid", providerItemId: "x", accessTokenEnc: "demo", institutionName: "Test Bank", status: "ok", cursor: "c1" });
    const other = await db.items.insert({ provider: "plaid", providerItemId: "y", accessTokenEnc: "demo", institutionName: "Other", status: "ok" });
    const acc = await db.accounts.insert({ itemId: item._id, providerAccountId: "a", name: "Chk", type: "depository", currentCents: 5000, currency: "USD" });
    await db.accounts.insert({ itemId: other._id, providerAccountId: "b", name: "Sav", type: "depository", currentCents: 700, currency: "USD" });
    await db.transactions.insert({ accountId: acc._id, source: "plaid", date: new Date(), amountCents: 100, currency: "USD", name: "x", tagIds: [], pending: false });
    await db.bills.insert({ name: "Card", dueDate: new Date(), source: "liability", accountId: acc._id, status: "upcoming", recurrence: "none" });

    expect(await archiveItem(u, item._id)).toEqual({ institution: "Test Bank" });
    const archived = (await db.items.byId(item._id))!;
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.accessTokenEnc).toBe("");
    expect(archived.cursor).toBeUndefined();
    expect((await db.accounts.byId(acc._id))!.archivedAt).toBeInstanceOf(Date);
    expect(await db.accounts.count({})).toBe(2);
    expect(await db.transactions.count({ accountId: acc._id })).toBe(1);
    expect(await db.bills.count({ accountId: acc._id })).toBe(1);
    expect(await db.auditLog.count({ action: "bank.archive" })).toBe(1);

    expect((await dashboardSummary(u)).cashCents).toBe(700);
    expect(await syncUser(u)).toEqual([]);
    await expect(archiveItem(u, item._id)).rejects.toThrow(/already archived/);
    await expect(archiveItem("someone-else", other._id)).rejects.toThrow(/not found/);
  });
});
