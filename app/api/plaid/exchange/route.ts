import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { linkItem } from "@/lib/bank/sync";

const body = z.object({ publicToken: z.string().min(1) });

export const POST = route(async (req: Request) => {
  const user = await requireApiUser();
  const { publicToken } = body.parse(await req.json());
  return NextResponse.json(await linkItem(user._id, publicToken));
});
