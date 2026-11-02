import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { syncUser } from "@/lib/bank/sync";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

export const POST = route(async () => {
  const user = await requireApiUser();
  await rateLimit("plaid:sync", 6, 60);
  return NextResponse.json({ results: await syncUser(user._id) });
});
