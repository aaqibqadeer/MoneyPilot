import { ChatLayoutShell } from "@/components/chat/chat-layout-shell";

export const metadata = { title: "Chat" };

export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return <ChatLayoutShell>{children}</ChatLayoutShell>;
}
