import { beforeAll, describe, expect, it } from "vitest";
import { generateRecoveryCodes, hashCode, newRecoveryCode, normalizeCode, recoveryCodesLeft, redeemMagicLink, redeemRecoveryCode } from "@/lib/auth/recovery";
import { sha256 } from "@/lib/crypto";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/db/demo";
import { repos } from "@/lib/db/repos";

describe("recovery", () => {
  beforeAll(async () => {
    await ensureDemoUser();
  });

  it("formats and normalizes codes", () => {
    expect(newRecoveryCode()).toMatch(/^[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/);
    expect(normalizeCode(" AB1O-il23 ")).toBe("ab101123");
    expect(hashCode("abcd-efgh-jkmn")).toBe(hashCode("ABCD EFGH JKMN"));
  });

  it("stores only hashes and redeems each code once", async () => {
    const codes = await generateRecoveryCodes(DEMO_USER_ID);
    expect(codes).toHaveLength(10);
    const stored = await repos(DEMO_USER_ID).recoveryCodes.find({});
    expect(stored.some((s) => JSON.stringify(s).includes(codes[0]))).toBe(false);
    expect(await redeemRecoveryCode(codes[0].toUpperCase())).toBe(DEMO_USER_ID);
    expect(await redeemRecoveryCode(codes[0])).toBeNull();
    expect(await recoveryCodesLeft(DEMO_USER_ID)).toEqual({ total: 10, left: 9 });
    expect(await redeemRecoveryCode("0000-0000-0000")).toBeNull();
    await generateRecoveryCodes(DEMO_USER_ID);
    expect(await redeemRecoveryCode(codes[1])).toBeNull();
  });

  it("magic links work once and expire", async () => {
    const db = repos(DEMO_USER_ID).magicLinks;
    await db.insert({ tokenHash: sha256("tok-live-aaaaaaaaaaaaaaaa"), expiresAt: new Date(Date.now() + 60000) });
    await db.insert({ tokenHash: sha256("tok-old-aaaaaaaaaaaaaaaaa"), expiresAt: new Date(Date.now() - 1) });
    expect(await redeemMagicLink("tok-live-aaaaaaaaaaaaaaaa")).toBe(DEMO_USER_ID);
    expect(await redeemMagicLink("tok-live-aaaaaaaaaaaaaaaa")).toBeNull();
    expect(await redeemMagicLink("tok-old-aaaaaaaaaaaaaaaaa")).toBeNull();
  });
});
