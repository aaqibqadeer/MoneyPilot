import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { redeemRecoveryCode } from "@/lib/auth/recovery";
import { createSession } from "@/lib/auth/session";
import { features } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ code: z.string().trim().min(8).max(40) });

/** Signs in with a one-time recovery code. */
export const POST = route(async (req: Request) => {
  if (features.demo) throw new HttpError(400, "Recovery needs MONGODB_URI. Demo mode signs you in automatically.");
  await rateLimit("auth:recover", 5, 60);
  const { code } = body.parse(await req.json());
  const userId = await redeemRecoveryCode(code);
  if (!userId) throw new HttpError(400, "That code is not valid or was already used.");
  await createSession(userId);
  return NextResponse.json({ ok: true });
});
