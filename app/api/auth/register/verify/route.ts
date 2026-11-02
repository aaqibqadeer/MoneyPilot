import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { relyingParty, signupAllowed, takeChallenge } from "@/lib/auth/webauthn";
import { collection, newId } from "@/lib/db/client";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ response: z.any(), passkeyName: z.string().max(60).optional() });

export const POST = route(async (req: Request) => {
  await rateLimit("auth:register", 10, 60);
  const { response, passkeyName } = body.parse(await req.json());
  const flow = await takeChallenge("register");
  const { rpID, origin } = await relyingParty();
  const v = await verifyRegistrationResponse({
    response,
    expectedChallenge: flow.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  if (!v.verified) throw new HttpError(400, "Passkey could not be verified.");

  const current = await getCurrentUser();
  const userId = flow.userId!;
  const now = new Date();
  const isSignup = !current;
  if (isSignup) {
    if (!(await signupAllowed())) throw new HttpError(403, "Sign-up is closed.");
    const pending = flow.pending ?? {};
    await collection("users").insertOne({
      _id: userId, name: pending.name ?? "", email: pending.email, currency: "USD",
      timezone: "America/New_York", theme: "calm", mode: "light", createdAt: now, updatedAt: now,
    });
  } else if (current._id !== userId) {
    throw new HttpError(400, "Flow mismatch.");
  }

  const { credential, credentialDeviceType } = v.registrationInfo;
  await collection("passkeys").insertOne({
    _id: newId(), userId, credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"), counter: credential.counter,
    transports: credential.transports ?? [],
    name: passkeyName ?? (credentialDeviceType === "multiDevice" ? "Synced passkey" : "Device passkey"),
    createdAt: now, updatedAt: now,
  });
  if (isSignup) await createSession(userId);
  return NextResponse.json({ ok: true, signup: isSignup, });
});
