import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomToken, sha256 } from "@/lib/crypto";
import { collection, newId } from "@/lib/db/client";
import { ensureDemoUser } from "@/lib/db/demo";
import type { User } from "@/lib/db/schemas";
import { env, features } from "@/lib/env";

export const SESSION_COOKIE = "mp_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Only extend expiry at most once per hour to avoid a write per request. */
export const SLIDE_AFTER_MS = 60 * 60 * 1000;

export function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Pure helper: should this session's expiry be pushed forward? */
export function nextExpiry(lastSeenAt: Date, now = new Date()): Date | null {
  return now.getTime() - lastSeenAt.getTime() > SLIDE_AFTER_MS ? new Date(now.getTime() + SESSION_TTL_MS) : null;
}

export async function createSession(userId: string) {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const h = await headers();
  await collection("sessions").insertOne({
    _id: newId(),
    userId,
    tokenHash: sha256(token),
    expiresAt,
    lastSeenAt: now,
    userAgent: h.get("user-agent")?.slice(0, 200) ?? undefined,
    createdAt: now,
    updatedAt: now,
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await collection("sessions").deleteOne({ tokenHash: sha256(token) });
  jar.delete(SESSION_COOKIE);
}

/** Current user or null. Demo mode always returns the demo user. Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (features.demo) return ensureDemoUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sessions = collection("sessions");
  const s = await sessions.findOne({ tokenHash: sha256(token) });
  const now = new Date();
  if (!s || s.expiresAt < now) return null;
  const next = nextExpiry(s.lastSeenAt, now);
  if (next) {
    await sessions.updateOne({ _id: s._id }, { $set: { lastSeenAt: now, expiresAt: next } });
    try {
      (await cookies()).set(SESSION_COOKIE, token, cookieOptions(next));
    } catch {
      // cookies are read-only during server component render; the DB expiry still slides
    }
  }
  return collection("users").findOne({ _id: s.userId });
});

/** SHA-256 of this request's session token, to mark "this device" in Settings. */
export async function currentTokenHash() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

/** For pages and server actions: redirect to /login when signed out. */
export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export class UnauthorizedError extends Error {
  status = 401;
}

/** For route handlers: throws UnauthorizedError. */
export async function requireApiUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new UnauthorizedError("Unauthorized");
  return u;
}
