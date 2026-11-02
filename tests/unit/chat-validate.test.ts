import { validateUIMessages } from "ai";
import { describe, expect, it } from "vitest";
import { incomingMetadataSchema, type ChatUIMessage } from "@/lib/ai/types";

describe("chat history validation", () => {
  it("accepts a user message without metadata (what useChat sends)", async () => {
    const messages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] }];
    await expect(validateUIMessages<ChatUIMessage>({ messages, metadataSchema: incomingMetadataSchema })).resolves.toHaveLength(1);
  });

  it("still rejects malformed metadata", async () => {
    const messages = [{ id: "a1", role: "assistant", metadata: { totalTokens: "x" }, parts: [{ type: "text", text: "hi" }] }];
    await expect(validateUIMessages<ChatUIMessage>({ messages, metadataSchema: incomingMetadataSchema })).rejects.toThrow();
  });
});
