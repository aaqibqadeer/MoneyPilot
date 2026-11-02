import { describe, expect, it } from "vitest";
import { planSync, toCents } from "@/lib/bank/merge";
import type { ProviderTransaction } from "@/lib/bank/types";

const t = (id: string, o: Partial<ProviderTransaction> = {}): ProviderTransaction => ({
  providerTransactionId: id,
  providerAccountId: "pa1",
  date: new Date("2026-10-01"),
  amountCents: 1234,
  currency: "USD",
  name: "UBER TRIP",
  pending: false,
  raw: {},
  ...o,
});
const accounts = new Map([["pa1", "acc1"]]);

describe("planSync", () => {
  it("upserts added and modified by provider id with mapped account", () => {
    const p = planSync([t("a")], [t("b", { amountCents: 99 })], [], accounts);
    expect(p.upserts.map((u) => u.providerTransactionId)).toEqual(["a", "b"]);
    expect(p.upserts[0].set.accountId).toBe("acc1");
    expect(p.upserts[1].set.amountCents).toBe(99);
    expect(p.deletes).toEqual([]);
  });

  it("never writes user-owned fields in $set", () => {
    const [u] = planSync([t("a")], [], [], accounts).upserts;
    for (const f of ["description", "notes", "tagIds"]) expect(u.set).not.toHaveProperty(f);
    expect(u.setOnInsert.tagIds).toEqual([]);
  });

  it("replaces a pending row with its posted version and carries user edits", () => {
    const posted = t("posted", { pendingTransactionId: "pend" });
    const p = planSync([posted], [], ["pend"], accounts, new Map([["pend", { description: "Ride home", notes: "work", tagIds: ["t1"] }]]));
    expect(p.deletes).toEqual(["pend"]);
    expect(p.upserts[0].setOnInsert).toMatchObject({ description: "Ride home", notes: "work", tagIds: ["t1"] });
  });

  it("deletes the pending row even when Plaid omits it from removed", () => {
    const p = planSync([t("posted", { pendingTransactionId: "pend" })], [], [], accounts);
    expect(p.deletes).toEqual(["pend"]);
  });

  it("is idempotent: the same page twice yields the same plan (no duplicates)", () => {
    const page = [t("a"), t("b")];
    expect(planSync(page, [], [], accounts)).toEqual(planSync(page, [], [], accounts));
  });

  it("collapses an id that is both added and modified into one upsert", () => {
    const p = planSync([t("a", { amountCents: 1 })], [t("a", { amountCents: 2 })], [], accounts);
    expect(p.upserts).toHaveLength(1);
    expect(p.upserts[0].set.amountCents).toBe(2);
  });

  it("does not delete an id it is also upserting", () => {
    const p = planSync([t("a")], [], ["a"], accounts);
    expect(p.deletes).toEqual([]);
  });

  it("converts dollars to integer cents", () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(-0.1)).toBe(-10);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(null)).toBeUndefined();
  });
});
