import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { chatStore } from "@/lib/ai/chat-store";
import { requireApiUser } from "@/lib/auth/session";

export const GET = route(async (req: Request) => {
  const user = await requireApiUser();
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 100) || undefined;
  const sessions = await chatStore(user._id).list(q);
  return NextResponse.json({
    sessions: sessions.map((s) => ({ id: s._id, title: s.title, pinned: s.pinned, lastMessageAt: s.lastMessageAt })),
  });
});
