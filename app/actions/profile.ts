"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { destroySession, requireUser } from "@/lib/auth/session";
import { collection } from "@/lib/db/client";
import { repos } from "@/lib/db/repos";
import { USER_SCOPED } from "@/lib/db/schemas";
import { features } from "@/lib/env";

type Result = { ok: true } | { ok: false; error: string };

const profile = z.object({
  name: z.string().trim().max(80),
  email: z.string().trim().email().max(200).or(z.literal("")),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
});

/** Profile lives on the user doc (auth plumbing, not a changeSet). */
export async function updateProfile(input: z.input<typeof profile>): Promise<Result> {
  const user = await requireUser();
  const p = profile.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid input" };
  const { email, ...rest } = p.data;
  if (email && email.toLowerCase() !== user.email?.toLowerCase() && (await collection("users").findOne({ email, _id: { $ne: user._id } }))) {
    return { ok: false, error: "That email is used by another account" };
  }
  await collection("users").updateOne({ _id: user._id }, { $set: { ...rest, updatedAt: new Date(), ...(email ? { email } : {}) }, ...(email ? {} : { $unset: { email: "" } }) });
  await repos(user._id).auditLog.insert({ action: "profile.update" });
  refresh();
  return { ok: true };
}

/**
 * Deletes the user and every document they own (and stored files). Plaid items are not
 * removed at Plaid (never call item/remove automatically, CLAUDE.md §7).
 */
export async function deleteAccount(confirmText: string): Promise<Result> {
  if (features.demo) return { ok: false, error: "Demo data resets on restart; there is no account to delete." };
  const user = await requireUser();
  if (confirmText !== "DELETE") return { ok: false, error: 'Type DELETE to confirm' };
  const db = repos(user._id);
  if (features.blob) {
    const urls = (await db.documents.find({ blobUrl: { $exists: true } }, { projection: { blobUrl: 1 } })).map((d) => d.blobUrl!).filter(Boolean);
    if (urls.length) {
      try {
        const { del } = await import("@vercel/blob");
        await del(urls);
      } catch (e) {
        console.error("[account] blob delete failed", (e as Error).message);
      }
    }
  }
  await destroySession();
  for (const c of USER_SCOPED) await db[c as keyof typeof db].deleteMany({});
  await collection("users").deleteOne({ _id: user._id });
  return { ok: true };
}
