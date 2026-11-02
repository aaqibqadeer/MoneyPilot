import { describe, expect, it } from "vitest";
import { nextExpiry, SESSION_TTL_MS, SLIDE_AFTER_MS } from "@/lib/auth/session";
import { memStore } from "@/lib/db/memory";
import { scopedRepo } from "@/lib/db/repos";

describe("scopedRepo", () => {
  it("only sees and touches its own user's documents", async () => {
    memStore.set("tags", []);
    const a = scopedRepo("tags", "A");
    const b = scopedRepo("tags", "B");
    await a.insert({ name: "Food", color: "#000" });
    await b.insert({ name: "Secret", color: "#000" });
    expect((await a.find({})).map((t) => t.name)).toEqual(["Food"]);
    expect((await a.find({ userId: "B" })).map((t) => t.name)).toEqual(["Food"]); // userId in filter is overridden
    expect(await a.deleteMany({})).toBe(1);
    expect((await b.find({})).map((t) => t.name)).toEqual(["Secret"]);
    const agg = await a.aggregate([{ $match: {} }]);
    expect(agg).toEqual([]);
  });

  it("refuses to change userId and to run without one", async () => {
    const a = scopedRepo("tags", "A");
    await expect(a.updateMany({}, { $set: { userId: "B" } })).rejects.toThrow(/immutable/);
    expect(() => scopedRepo("tags", "")).toThrow();
  });

  it("upserts stamp the owner", async () => {
    memStore.set("accounts", []);
    const a = scopedRepo("accounts", "A");
    await a.updateOne({ providerAccountId: "p1" }, { $set: { name: "Chk" } }, { upsert: true });
    const [doc] = memStore.get("accounts")!;
    expect(doc.userId).toBe("A");
    expect(typeof doc._id).toBe("string");
  });
});

describe("session sliding expiry", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  it("does not extend a session seen recently", () => {
    expect(nextExpiry(new Date(now.getTime() - SLIDE_AFTER_MS + 1000), now)).toBeNull();
  });
  it("extends a session idle for over an hour by the full TTL", () => {
    const next = nextExpiry(new Date(now.getTime() - SLIDE_AFTER_MS - 1000), now);
    expect(next?.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
  });
});
