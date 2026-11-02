import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { requestMagicLink } from "@/lib/auth/recovery";
import { relyingParty } from "@/lib/auth/webauthn";
import { features } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ email: z.string().trim().email().max(200) });

/** Emails a 15-minute sign-in link. Always answers the same way so addresses can't be probed. */
export const POST = route(async (req: Request) => {
  if (features.demo || !features.email) throw new HttpError(503, "Email recovery is not configured (RESEND_API_KEY, EMAIL_FROM).");
  await rateLimit("auth:magic", 3, 60);
  const { email } = body.parse(await req.json());
  const { origin } = await relyingParty();
  await requestMagicLink(email, origin);
  return NextResponse.json({ ok: true });
});
