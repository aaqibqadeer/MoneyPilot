import { beforeAll, describe, expect, it } from "vitest";
import { readTools } from "@/lib/ai/tools";
import { writeTools } from "@/lib/ai/write-tools";
import { accountDetail, accountLabel, accountTitle, matchAccounts } from "@/lib/accounts";
import { applyChangeSet, revertChangeSet } from "@/lib/changes";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";
import { repos } from "@/lib/db/repos";
import { listTransactions } from "@/lib/queries";

type Exec = (input: unknown, opts?: unknown) => Promise<Record<string, unknown>>;
const call = (tools: object, name: string, input: unknown) => ((tools as Record<string, { execute: Exec }>)[name]).execute(input, { toolCallId: "t", messages: [] });
const db = () => repos(DEMO_USER_ID);

const accts = [
  { _id: "a1", name: "Everyday Checking", nickname: "Bills", mask: "0001" },
  { _id: "a2", name: "Rewards Card", mask: "4242", archivedAt: new Date() },
  { _id: "a3", name: "High-Yield Savings", officialName: "Online Savings Plus", mask: "0002" },
];

describe("account labels", () => {
  it("shows the nickname with the bank name beside it", () => {
    expect(accountTitle(accts[0])).toBe("Bills");
    expect(accountDetail(accts[0])).toBe("Everyday Checking •••0001");
    expect(accountLabel(accts[0])).toBe("Bills (Everyday Checking •••0001)");
    expect(accountLabel(accts[1])).toBe("Rewards Card •••4242 (archived)");
    expect(accountLabel(accts[1], { archived: false })).toBe("Rewards Card •••4242");
    expect(accountTitle({ name: "X", nickname: "  " })).toBe("X");
  });

  it("matches ids, nicknames, names, official names and last 4", () => {
    expect(matchAccounts(accts, ["bills"]).ids).toEqual(["a1"]);
    expect(matchAccounts(accts, ["a2", "•••0002"]).ids).toEqual(["a2", "a3"]);
    expect(matchAccounts(accts, ["4242"]).ids).toEqual(["a2"]);
    expect(matchAccounts(accts, ["online savings plus"]).ids).toEqual(["a3"]);
    expect(matchAccounts(accts, ["check"]).ids).toEqual(["a1"]);
    expect(matchAccounts(accts, ["nope"])).toEqual({ ids: [], unmatched: ["nope"] });
  });
});

describe("nicknames and multi-account filters on demo data", () => {
  beforeAll(async () => {
    await ensureDemoUser();
  });

  it("filters transactions by several accounts", async () => {
    const accounts = await db().accounts.find({});
    const ids = accounts.filter((a) => a.name !== "High-Yield Savings").map((a) => a._id);
    const both = await listTransactions(DEMO_USER_ID, { accountIds: ids, pageSize: 500 });
    const one = await listTransactions(DEMO_USER_ID, { accountIds: [ids[0]], pageSize: 500 });
    expect(both.total).toBeGreaterThan(one.total);
    expect(both.rows.every((t) => ids.includes(t.accountId!))).toBe(true);
  });

  it("chat proposes a nickname; tools then find the account by it; undo removes it", async () => {
    const card = (await db().accounts.findOne({ name: "Rewards Card" }))!;
    const r = (await call(writeTools(DEMO_USER_ID), "proposeChanges", { summary: "Name the card", accounts: [{ id: card._id, nickname: "Travel card" }] })) as {
      changeSetId: string; records: { type: string; changes: string[] }[];
    };
    expect(r.records[0]).toMatchObject({ type: "account", changes: ["nickname: none → Travel card"] });
    expect((await db().accounts.byId(card._id))!.nickname).toBeUndefined();
    await applyChangeSet(DEMO_USER_ID, r.changeSetId);
    expect((await db().accounts.byId(card._id))!.nickname).toBe("Travel card");

    const tools = readTools(DEMO_USER_ID);
    const list = (await call(tools, "getAccounts", {})) as unknown as { id: string; nickname?: string; label: string }[];
    expect(list.find((a) => a.id === card._id)).toMatchObject({ nickname: "Travel card", label: "Travel card (Rewards Card •••4242)" });
    const s = (await call(tools, "searchTransactions", { accounts: ["travel card"], limit: 5 })) as { total: number; transactions: { account: string }[] };
    expect(s.total).toBeGreaterThan(0);
    expect(s.transactions.every((t) => t.account.startsWith("Travel card"))).toBe(true);
    expect(await call(tools, "searchTransactions", { accounts: ["zzz"], limit: 5 })).toHaveProperty("error");

    await revertChangeSet(DEMO_USER_ID, r.changeSetId);
    expect((await db().accounts.byId(card._id))!.nickname).toBeUndefined();
  });
});
