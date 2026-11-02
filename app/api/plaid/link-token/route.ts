import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { getBankProvider } from "@/lib/bank/plaid";
import { updateLinkToken } from "@/lib/bank/sync";
import { rateLimit } from "@/lib/rate-limit";

const body = z.object({ itemId: z.string().optional() });

export const POST = route(async (req: Request) => {
  const user = await requireApiUser();
  await rateLimit("plaid:link", 20, 60);
  const p = getBankProvider();
  if (!p) throw new HttpError(503, "Plaid is not configured.");
  const { itemId } = body.parse(await req.json().catch(() => ({})));
  const linkToken = itemId ? await updateLinkToken(user._id, itemId) : await p.createLinkToken(user._id);
  return NextResponse.json({ linkToken });
});
