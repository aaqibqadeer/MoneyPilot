import { beforeAll, describe, expect, it } from "vitest";
import { commit, revertChangeSet } from "@/lib/changes";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";
import { repos } from "@/lib/db/repos";
import { fileKind, markDuplicates } from "@/lib/documents/extract";
import { planImport, uploadDocument } from "@/lib/documents/service";

describe("documents", () => {
  beforeAll(async () => {
    await ensureDemoUser();
  });

  it("accepts known types only", () => {
    expect(fileKind("stmt.CSV", "application/vnd.ms-excel")).toBe("csv");
    expect(fileKind("a.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("xlsx");
    expect(fileKind("photo.jpeg", "image/jpeg")).toBe("jpg");
    expect(fileKind("evil.exe", "application/octet-stream")).toBeNull();
    expect(fileKind("fake.pdf", "text/html")).toBeNull();
  });

  it("flags duplicates within ±2 days, once per existing row", () => {
    const out = markDuplicates(
      [{ date: "2026-10-03", description: "a", amountCents: 500 }, { date: "2026-10-03", description: "b", amountCents: 500 }, { date: "2026-10-10", description: "c", amountCents: 500 }],
      [{ _id: "x", date: new Date("2026-10-04T00:00:00Z"), amountCents: 500 }],
    );
    expect(out.map((r) => r.duplicateOf)).toEqual(["x", undefined, undefined]);
  });

  it("uploads a CSV, imports picked rows as one undoable change", async () => {
    const db = repos(DEMO_USER_ID);
    const existing = (await db.transactions.findOne({ merchant: "Hulu" }))!;
    const d = existing.date.toISOString().slice(0, 10);
    const csv = `Date,Description,Amount\n${d},HULU,-17.99\n2026-10-20,Corner Bakery,-8.25\n2026-10-21,Refund,5.00\n`;
    const up = await uploadDocument(DEMO_USER_ID, new File([csv], "stmt.csv", { type: "text/csv" }));
    expect(up).toMatchObject({ status: "parsed", found: 3 });
    const doc = (await db.documents.byId(up.id))!;
    const ex = doc.extracted as { transactions: { duplicateOf?: string; amountCents: number }[] };
    expect(ex.transactions.map((t) => [t.amountCents, !!t.duplicateOf])).toEqual([[1799, true], [825, false], [-500, false]]);

    const { ops } = await planImport(DEMO_USER_ID, up.id, { transactions: [1, 2], bills: [], claims: [] }, "USD");
    const cs = await commit(DEMO_USER_ID, "import", ops, "import");
    const imported = await db.transactions.find({ documentId: up.id });
    expect(imported.map((t) => [t.name, t.source, t.amountCents]).sort()).toEqual([["Corner Bakery", "import", 825], ["Refund", "import", -500]]);
    await revertChangeSet(DEMO_USER_ID, cs);
    expect(await db.transactions.count({ documentId: up.id })).toBe(0);
  });

  it("rejects oversized and unknown files", async () => {
    await expect(uploadDocument(DEMO_USER_ID, new File(["x"], "a.exe"))).rejects.toThrow(/Upload a CSV/);
  });
});
