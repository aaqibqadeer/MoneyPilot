import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { relyingParty, saveChallenge, signupAllowed } from "@/lib/auth/webauthn";
import { collection, newId } from "@/lib/db/client";
import { features } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ name: z.string().trim().max(80).optional(), email: z.string().email().optional() });

export const POST = route(async (req: Request) => {
  if (features.demo) throw new HttpError(400, "Passkeys need MONGODB_URI. Demo mode signs you in automatically.");
  await rateLimit("auth:register", 10, 60);
  const input = body.parse(await req.json().catch(() => ({})));
  const current = await getCurrentUser();
  if (!current && !(await signupAllowed())) throw new HttpError(403, "Sign-up is closed.");

  const userId = current?._id ?? newId();
  const existing = current ? await collection("passkeys").find({ userId }) : [];
  const { rpID, rpName } = await relyingParty();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: current?.email ?? input.email ?? input.name ?? "MoneyPilot user",
    userDisplayName: current?.name ?? input.name ?? "",
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await saveChallenge("register", options.challenge, userId, current ? undefined : { name: input.name, email: input.email });
  return NextResponse.json(options);
});
