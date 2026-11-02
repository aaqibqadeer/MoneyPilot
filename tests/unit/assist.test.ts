import { describe, expect, it } from "vitest";
import { cancelHelp, cancelLetter, disputeDeadline, disputeLetter, issuerHelp, mailto, refundLetter } from "@/lib/assist";

describe("cancel help", () => {
  it("matches raw bank names to known services", () => {
    expect(cancelHelp("NETFLIX.COM 866-579-7172").name).toBe("Netflix");
    expect(cancelHelp("APPLE.COM/BILL").via).toBe("apple");
    expect(cancelHelp("GOOGLE *YouTubePremium").name).toBe("YouTube Premium / TV");
    expect(cancelHelp("Google *Google One").via).toBe("google");
    expect(cancelHelp("YouTube Premium").name).toBe("YouTube Premium / TV");
    expect(cancelHelp("Spotify USA").url).toMatch(/^https:\/\/www\.spotify\.com/);
  });

  it("falls back to a search link for unknown merchants", () => {
    const c = cancelHelp("Acme Widgets Club");
    expect(c.known).toBe(false);
    expect(c.url).toContain(encodeURIComponent("how to cancel Acme Widgets Club"));
  });

  it("every link is https", () => {
    for (const m of ["netflix", "hulu", "adobe", "planet fitness", "uber one", "zzz"]) expect(cancelHelp(m).url).toMatch(/^https:\/\//);
  });

  it("drafts a cancellation email", () => {
    const l = cancelLetter({ merchant: "Hulu", amountCents: 1899, mask: "4242", name: "Aaqib" });
    expect(l.subject).toBe("Cancel my Hulu subscription");
    expect(l.body).toContain("$18.99");
    expect(l.body).toContain("ending 4242");
    expect(l.body).toContain("Aaqib");
  });
});

describe("dispute help", () => {
  const facts = { merchant: "Gym Co", amountCents: 4999, date: "2026-10-01", mask: "1234", reason: "cancelled" as const };

  it("finds the issuer from the institution name", () => {
    expect(issuerHelp("Chase").name).toBe("Chase");
    expect(issuerHelp("American Express").url).toBe("https://www.americanexpress.com/");
    expect(issuerHelp("Tiny Credit Union").known).toBe(false);
    expect(issuerHelp(undefined).url).toBe("");
  });

  it("refund and dispute letters carry the facts", () => {
    const r = refundLetter(facts);
    expect(r.subject).toContain("$49.99");
    expect(r.body).toContain("October 1, 2026");
    const d = disputeLetter({ ...facts, accountType: "credit", issuer: "Chase" });
    expect(d.body).toContain("To Chase");
    expect(d.body).toContain("Fair Credit Billing Act");
    expect(disputeLetter({ ...facts, accountType: "depository" }).body).not.toContain("Fair Credit Billing Act");
  });

  it("deadline is charge date + 60 days, with the rule for the account type", () => {
    const c = disputeDeadline("2026-10-01", "credit");
    expect(c.actBy.toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(c.rule).toMatch(/Credit card/);
    expect(disputeDeadline("2026-10-01", "depository").rule).toMatch(/2 business days/);
  });

  it("mailto encodes subject and body", () => {
    expect(mailto({ subject: "a b", body: "x&y" })).toBe("mailto:?subject=a%20b&body=x%26y");
  });
});
