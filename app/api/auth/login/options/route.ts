import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/api";
import { relyingParty, saveChallenge } from "@/lib/auth/webauthn";
import { features } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

export const POST = route(async () => {
  if (features.demo) throw new HttpError(400, "Demo mode signs you in automatically.");
  await rateLimit("auth:login", 20, 60);
  const { rpID } = await relyingParty();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await saveChallenge("login", options.challenge);
  return NextResponse.json(options);
});
