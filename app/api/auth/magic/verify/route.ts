import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { redeemMagicLink } from "@/lib/auth/recovery";
import { createSession } from "@/lib/auth/session";
import { features } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ token: z.string().min(20).max(100) });

/** POST (not GET) so email link scanners can't burn the token by prefetching it. */
export const POST = route(async (req: Request) => {
  if (features.demo) throw new HttpError(400, "Not available in demo mode.");
  await rateLimit("auth:magic", 10, 60);
  const { token } = body.parse(await req.json());
  const userId = await redeemMagicLink(token);
  if (!userId) throw new HttpError(400, "This link has expired or was already used. Request a new one.");
  await createSession(userId);
  return NextResponse.json({ ok: true });
});
