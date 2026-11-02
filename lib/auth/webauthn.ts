import "server-only";
import { cookies, headers } from "next/headers";
import { HttpError } from "@/lib/api";
import { randomToken } from "@/lib/crypto";
import { collection } from "@/lib/db/client";
import { env } from "@/lib/env";

const FLOW_COOKIE = "mp_flow";
const FLOW_TTL_MS = 5 * 60 * 1000;

/** RP ID / origin: env first, otherwise derived from the request host (works on localhost and previews). */
export async function relyingParty() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = env.APP_URL?.replace(/\/$/, "") ?? `${proto}://${host}`;
  const rpID = env.WEBAUTHN_RP_ID ?? new URL(origin).hostname;
  return { rpID, origin, rpName: env.WEBAUTHN_RP_NAME };
}

export async function saveChallenge(
  kind: "register" | "login",
  challenge: string,
  userId?: string,
  pending?: { name?: string; email?: string },
) {
  const id = randomToken(16);
  const expiresAt = new Date(Date.now() + FLOW_TTL_MS);
  await collection("authChallenges").insertOne({ _id: id, kind, challenge, userId, pending, expiresAt });
  (await cookies()).set(FLOW_COOKIE, id, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    expires: expiresAt,
  });
}

/** Single use: the challenge is deleted as soon as it is read. */
export async function takeChallenge(kind: "register" | "login") {
  const jar = await cookies();
  const id = jar.get(FLOW_COOKIE)?.value;
  jar.delete(FLOW_COOKIE);
  if (!id) throw new HttpError(400, "Sign-in flow expired, please try again.");
  const c = collection("authChallenges");
  const doc = await c.findOne({ _id: id });
  await c.deleteOne({ _id: id });
  if (!doc || doc.kind !== kind || doc.expiresAt < new Date()) {
    throw new HttpError(400, "Sign-in flow expired, please try again.");
  }
  return doc;
}

/** Signup allowed when ALLOW_SIGNUP=true or no user exists yet (first-run setup). */
export async function signupAllowed() {
  if (env.ALLOW_SIGNUP) return true;
  return (await collection("users").countDocuments({})) === 0;
}
