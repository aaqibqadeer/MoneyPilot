import { describe, expect, it } from "vitest";
import { orderedTimestamps } from "@/lib/ai/chat-order";

const increasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

describe("orderedTimestamps", () => {
  it("keeps a new question before its reply that started streaming earlier", () => {
    // stored q1/a1, new q2 without time, a2 stamped at stream start
    const t = orderedTimestamps([1000, 1005, undefined, 2000], 9999);
    expect(increasing(t)).toBe(true);
    expect(t[3]).toBe(2000);
  });

  it("handles a first turn where only the reply has a time", () => {
    const t = orderedTimestamps([undefined, 5000], 9999);
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBe(5000);
  });

  it("breaks same-millisecond ties and out-of-order client times", () => {
    expect(increasing(orderedTimestamps([7, 7, 7, 3, undefined]))).toBe(true);
  });

  it("works with no times at all", () => {
    const t = orderedTimestamps([undefined, undefined, undefined], 100);
    expect(t).toEqual([97, 98, 99]);
  });
});
