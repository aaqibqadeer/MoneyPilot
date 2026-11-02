import { describe, expect, it } from "vitest";
import { MemoryColl, memStore } from "@/lib/db/memory";

describe("memory backend", () => {
  it("aggregations never mutate stored rows", async () => {
    memStore.set("transactions", [
      { _id: "1", userId: "u", tagIds: [], amountCents: 100 },
      { _id: "2", userId: "u", tagIds: ["t"], amountCents: 200 },
    ]);
    const c = new MemoryColl("transactions");
    const rows = await c.aggregate<{ _id: string | null; n: number }>([
      { $unwind: { path: "$tagIds", preserveNullAndEmptyArrays: true } },
      { $group: { _id: "$tagIds", n: { $sum: 1 } } },
    ]);
    expect(rows).toHaveLength(2);
    expect(memStore.get("transactions")!.map((r) => r.tagIds)).toEqual([[], ["t"]]);
  });
});
