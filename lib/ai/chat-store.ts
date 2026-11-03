import "server-only";
import { collection } from "@/lib/db/client";
import { repos } from "@/lib/db/repos";
import type { ChatUIMessage } from "./types";
import { orderedTimestamps } from "./chat-order";

/** Chat persistence: sessions + one row per UI message (parts include tool calls/results). */
export function chatStore(userId: string) {
  const db = repos(userId);
  return {
    list: (q?: string) =>
      db.chatSessions.find(q ? { title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } : {}, {
        sort: { pinned: -1, lastMessageAt: -1 },
        limit: 200,
      }),
    get: (id: string) => db.chatSessions.byId(id),

    /** Creates the session if this id is new. Refuses ids owned by someone else. */
    async ensure(id: string) {
      const mine = await db.chatSessions.byId(id);
      if (mine) return mine;
      if (await collection("chatSessions").findOne({ _id: id })) throw Object.assign(new Error("Not found"), { status: 404 });
      return db.chatSessions.insert({ _id: id, title: "New chat", pinned: false, lastMessageAt: new Date() });
    },

    async messages(sessionId: string): Promise<ChatUIMessage[]> {
      const rows = await db.chatMessages.find({ sessionId }, { sort: { createdAt: 1, _id: 1 } });
      return rows.map((r) => ({
        id: r._id,
        role: r.role,
        parts: r.parts as ChatUIMessage["parts"],
        metadata: { createdAt: r.createdAt.getTime(), model: r.model, ...(r.usage ?? {}) },
      }));
    },

    /** Replaces the transcript (handles regenerate / edit-last which truncate history). */
    async save(sessionId: string, messages: ChatUIMessage[]) {
      await db.chatMessages.deleteMany({ sessionId });
      const times = orderedTimestamps(messages.map((m) => m.metadata?.createdAt));
      await db.chatMessages.insertMany(
        messages.map((m, i) => ({
          _id: m.id || undefined,
          sessionId,
          role: m.role,
          parts: m.parts,
          model: m.metadata?.model,
          usage: m.metadata?.totalTokens !== undefined
            ? { inputTokens: m.metadata.inputTokens, outputTokens: m.metadata.outputTokens, totalTokens: m.metadata.totalTokens }
            : undefined,
          // strictly increasing in array order, so a reload sorts like the live chat
          createdAt: new Date(times[i]),
        })) as never,
      );
      await db.chatSessions.updateOne({ _id: sessionId }, { $set: { lastMessageAt: new Date() } });
    },

    rename: (id: string, title: string) => db.chatSessions.updateOne({ _id: id }, { $set: { title: title.slice(0, 120) } }),
    pin: (id: string, pinned: boolean) => db.chatSessions.updateOne({ _id: id }, { $set: { pinned } }),
    async remove(id: string) {
      await db.chatMessages.deleteMany({ sessionId: id });
      await db.chatSessions.deleteOne({ _id: id });
    },
  };
}
