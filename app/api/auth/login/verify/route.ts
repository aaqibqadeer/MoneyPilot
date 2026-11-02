import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { createSession } from "@/lib/auth/session";
import { relyingParty, takeChallenge } from "@/lib/auth/webauthn";
import { collection } from "@/lib/db/client";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ response: z.object({ id: z.string() }).passthrough() });

export const POST = route(async (req: Request) => {
  await rateLimit("auth:login", 20, 60);
  const { response } = body.parse(await req.json());
  const flow = await takeChallenge("login");
  const passkeys = collection("passkeys");
  const pk = await passkeys.findOne({ credentialId: response.id });
  if (!pk) throw new HttpError(400, "Unknown passkey. Try another, or recover your account.");
  const { rpID, origin } = await relyingParty();
  const v = await verifyAuthenticationResponse({
    response: response as never,
    expectedChallenge: flow.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: pk.credentialId,
      publicKey: new Uint8Array(Buffer.from(pk.publicKey, "base64url")),
      counter: pk.counter,
      transports: pk.transports as never,
    },
  });
  if (!v.verified) throw new HttpError(400, "Passkey could not be verified.");
  await passkeys.updateOne(
    { _id: pk._id },
    { $set: { counter: v.authenticationInfo.newCounter, lastUsedAt: new Date(), updatedAt: new Date() } },
  );
  await createSession(pk.userId);
  return NextResponse.json({ ok: true });
});
