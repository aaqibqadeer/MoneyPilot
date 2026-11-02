import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { chatStore } from "@/lib/ai/chat-store";
import { requireApiUser } from "@/lib/auth/session";

const patch = z.object({ title: z.string().trim().min(1).max(120).optional(), pinned: z.boolean().optional() });

export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/chat/sessions/[id]">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const { title, pinned } = patch.parse(await req.json());
  const store = chatStore(user._id);
  if (title !== undefined) await store.rename(id, title);
  if (pinned !== undefined) await store.pin(id, pinned);
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, ctx: RouteContext<"/api/chat/sessions/[id]">) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  await chatStore(user._id).remove(id);
  return NextResponse.json({ ok: true });
});
