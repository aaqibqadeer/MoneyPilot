import { describe, expect, it } from "vitest";
import { withUpsertId } from "@/lib/db/client";

describe("withUpsertId", () => {
  it("adds a string _id on upsert when the filter has none", () => {
    const u = withUpsertId({ providerItemId: "x" }, { $set: { a: 1 } }, true);
    expect(typeof u.$setOnInsert._id).toBe("string");
  });
  it("keeps the filter _id (rate limits): no conflicting $setOnInsert._id", () => {
    const u = withUpsertId({ _id: "auth:login:ip:1" }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: 1 } }, true);
    expect(u.$setOnInsert._id).toBeUndefined();
  });
  it("leaves non-upserts untouched", () => {
    const upd = { $set: { a: 1 } };
    expect(withUpsertId({}, upd, false)).toBe(upd);
  });
});
