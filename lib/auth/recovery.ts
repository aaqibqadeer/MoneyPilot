import "server-only";
import { randomBytes } from "node:crypto";
import { randomToken, sha256 } from "@/lib/crypto";
import { collection } from "@/lib/db/client";
import { repos } from "@/lib/db/repos";
import { sendEmail } from "@/lib/email";
import { escapeRx } from "@/lib/edits";
import { features } from "@/lib/env";

/** Account recovery (CLAUDE.md §10): 10 hashed one-time codes, and 15-minute single-use email links. */

export const RECOVERY_CODE_COUNT = 10;
export const MAGIC_TTL_MS = 15 * 60 * 1000;
const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

/** 12 Crockford base32 chars (60 bits) shown as xxxx-xxxx-xxxx. */
export function newRecoveryCode(): string {
  let s = "";
  for (const b of randomBytes(12)) s += CROCKFORD[b & 31];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/** Forgives case, spaces, dashes and the look-alikes i/l→1, o→0. */
export const normalizeCode = (input: string) =>
  input.toLowerCase().replace(/[^0-9a-z]/g, "").replace(/[il]/g, "1").replace(/o/g, "0");

export const hashCode = (code: string) => sha256(`recovery:${normalizeCode(code)}`);

/** Replaces any previous codes. The plain codes are returned once and never stored. */
export async function generateRecoveryCodes(userId: string) {
  const db = repos(userId);
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await db.recoveryCodes.deleteMany({});
  await db.recoveryCodes.insertMany(codes.map((c) => ({ codeHash: hashCode(c) })));
  await db.auditLog.insert({ action: "recovery.generate" });
  return codes;
}

export async function recoveryCodesLeft(userId: string) {
  const db = repos(userId);
  const [total, left] = await Promise.all([db.recoveryCodes.count({}), db.recoveryCodes.count({ usedAt: { $exists: false } })]);
  return { total, left };
}

/** Marks a code used exactly once. Returns the owner's userId, or null. */
export async function redeemRecoveryCode(code: string): Promise<string | null> {
  if (normalizeCode(code).length !== 12) return null;
  const c = collection("recoveryCodes");
  const doc = await c.findOne({ codeHash: hashCode(code), usedAt: { $exists: false } });
  if (!doc) return null;
  const r = await c.updateOne({ _id: doc._id, usedAt: { $exists: false } }, { $set: { usedAt: new Date(), updatedAt: new Date() } });
  if (!r.matchedCount) return null;
  await repos(doc.userId).auditLog.insert({ action: "recovery.use" });
  return doc.userId;
}

/** Emails a sign-in link if the address belongs to a user. Silent otherwise, so addresses can't be probed. */
export async function requestMagicLink(email: string, origin: string) {
  if (!features.email) return;
  const user = await collection("users").findOne({ email: { $regex: `^${escapeRx(email.trim())}$`, $options: "i" } });
  if (!user?.email) return;
  const token = randomToken();
  await repos(user._id).magicLinks.insert({ tokenHash: sha256(token), expiresAt: new Date(Date.now() + MAGIC_TTL_MS) });
  const url = `${origin}/recover?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Your MoneyPilot sign-in link",
    text: `Sign in to MoneyPilot: ${url}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    html: `<p><a href="${url}">Sign in to MoneyPilot</a></p><p>The link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.</p>`,
  });
}

export async function redeemMagicLink(token: string): Promise<string | null> {
  const c = collection("magicLinks");
  const doc = await c.findOne({ tokenHash: sha256(token) });
  if (!doc || doc.usedAt || doc.expiresAt < new Date()) return null;
  const r = await c.updateOne({ _id: doc._id, usedAt: { $exists: false } }, { $set: { usedAt: new Date(), updatedAt: new Date() } });
  if (!r.matchedCount) return null;
  await repos(doc.userId).auditLog.insert({ action: "magicLink.use" });
  return doc.userId;
}
