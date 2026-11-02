import { describe, expect, it } from "vitest";
import { detectMapping, parseCsv, rowsToTxns, toCents, toIsoDate } from "@/lib/documents/tabular";

describe("tabular import", () => {
  it("parses quoted CSV and maps a signed-amount bank export", () => {
    const rows = parseCsv('Account: 1234\nDate,Description,Amount\n10/03/2026,"ACME, INC PAYROLL",3100.00\n10/04/2026,"Joe\'s ""Diner""",-24.50\n\n10/05/2026,Bad row,\n');
    const d = detectMapping(rows)!;
    expect(d.headerRow).toBe(1);
    const { txns, skipped } = rowsToTxns(rows, d.headerRow, d.mapping);
    expect(txns).toEqual([
      { date: "2026-10-03", description: "ACME, INC PAYROLL", amountCents: -310000 },
      { date: "2026-10-04", description: 'Joe\'s "Diner"', amountCents: 2450 },
    ]);
    expect(skipped).toBe(1);
  });

  it("handles debit/credit columns and positive-purchase card exports", () => {
    const dc = parseCsv("Posted Date;Payee;Debit;Credit\n2026-10-01;Shell;45,00;\n2026-10-02;Refund;;10.00");
    const m = detectMapping(dc)!;
    expect(rowsToTxns(dc, m.headerRow, m.mapping).txns.map((t) => t.amountCents)).toEqual([4500, -1000]);
    const card = parseCsv("Transaction Date,Merchant,Amount\n2026-10-01,Uber,12.00\n2026-10-02,Lyft,8.00\n2026-10-03,Payment,-20.00");
    const c = detectMapping(card)!;
    expect(c.mapping.invert).toBe(false);
    expect(rowsToTxns(card, c.headerRow, c.mapping).txns[0].amountCents).toBe(1200);
  });

  it("parses money and dates", () => {
    expect([toCents("$1,234.56"), toCents("(12.00)"), toCents("1.234,56"), toCents("abc"), toCents(3.1)]).toEqual([123456, -1200, 123456, null, 310]);
    expect([toIsoDate("2026-10-03"), toIsoDate("10/3/26"), toIsoDate("25/12/2026"), toIsoDate(46000), toIsoDate("31.12.2026")]).toEqual(["2026-10-03", "2026-10-03", "2026-12-25", "2025-12-09", "2026-12-31"]);
    expect(detectMapping([["foo", "bar"], ["1", "2"]])).toBeNull();
  });
});
