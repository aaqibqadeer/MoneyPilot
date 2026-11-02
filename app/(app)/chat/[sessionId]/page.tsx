import { notFound } from "next/navigation";
import { Chat } from "@/components/chat/chat";
import { chatStore } from "@/lib/ai/chat-store";
import { requireUser } from "@/lib/auth/session";
import { features } from "@/lib/env";

export default async function ChatSessionPage({ params }: PageProps<"/chat/[sessionId]">) {
  const user = await requireUser();
  const { sessionId } = await params;
  const store = chatStore(user._id);
  const session = await store.get(sessionId);
  if (!session) notFound();
  const messages = await store.messages(sessionId);
  return <Chat key={sessionId} id={sessionId} initialMessages={messages} aiReady={features.llm} />;
}
