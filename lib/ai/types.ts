import type { UIMessage } from "ai";
import { z } from "zod";

export const messageMetadataSchema = z.object({
  createdAt: z.number().optional(),
  model: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});
export type MessageMetadata = z.infer<typeof messageMetadataSchema>;
/** For validating incoming history: messages sent by useChat carry no metadata. */
export const incomingMetadataSchema = messageMetadataSchema.optional();
export type ChatUIMessage = UIMessage<MessageMetadata>;
