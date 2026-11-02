"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { generateRecoveryCodes } from "@/lib/auth/recovery";
import { currentTokenHash, requireUser } from "@/lib/auth/session";
import { repos } from "@/lib/db/repos";
import { features } from "@/lib/env";

/** Settings → Security. Auth plumbing, so these are audited but not changeSets (they can't be undone). */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const id = z.string().min(1).max(100);

async function run<T extends object>(fn: (userId: string) => Promise<T | string>): Promise<Result<T>> {
  if (features.demo) return { ok: false, error: "Security settings need a database (MONGODB_URI)." };
  const user = await requireUser();
  try {
    const r = await fn(user._id);
    if (typeof r === "string") return { ok: false, error: r };
    refresh();
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Invalid input" };
    console.error("[security]", (e as Error).message);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function renamePasskey(passkeyId: string, name: string) {
  return run(async (userId) => {
    const n = z.string().trim().min(1).max(60).parse(name);
    const r = await repos(userId).passkeys.updateOne({ _id: id.parse(passkeyId) }, { $set: { name: n } });
    return r.matchedCount ? {} : "Passkey not found";
  });
}

export async function removePasskey(passkeyId: string) {
  return run(async (userId) => {
    const db = repos(userId);
    if ((await db.passkeys.count({})) <= 1) return "You can't remove your only passkey. Add another first.";
    if (!(await db.passkeys.deleteOne({ _id: id.parse(passkeyId) }))) return "Passkey not found";
    await db.auditLog.insert({ action: "passkey.remove", detail: { passkeyId } });
    return {};
  });
}

export async function revokeSession(sessionId: string) {
  return run(async (userId) => {
    const db = repos(userId);
    const s = await db.sessions.byId(id.parse(sessionId));
    if (!s) return "Session not found";
    if (s.tokenHash === (await currentTokenHash())) return "Use Sign out to end this session.";
    await db.sessions.deleteOne({ _id: s._id });
    await db.auditLog.insert({ action: "session.revoke" });
    return {};
  });
}

export async function revokeOtherSessions() {
  return run(async (userId) => {
    const db = repos(userId);
    const n = await db.sessions.deleteMany({ tokenHash: { $ne: await currentTokenHash() } });
    await db.auditLog.insert({ action: "session.revokeOthers", detail: { count: n } });
    return { count: n };
  });
}

/** Returns the new plain codes once; older codes stop working. */
export async function newRecoveryCodes() {
  return run(async (userId) => ({ codes: await generateRecoveryCodes(userId) }));
}
