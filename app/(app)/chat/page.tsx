import { connection } from "next/server";
import { Chat } from "@/components/chat/chat";
import { requireUser } from "@/lib/auth/session";
import { features } from "@/lib/env";

export default async function NewChatPage() {
  await connection();
  await requireUser();
  const id = crypto.randomUUID();
  return <Chat key={id} id={id} initialMessages={[]} aiReady={features.llm} />;
}
