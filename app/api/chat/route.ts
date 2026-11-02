import {
  convertToModelMessages, createIdGenerator, createUIMessageStreamResponse, generateText, stepCountIs,
  streamText, toUIMessageStream, TypeValidationError, validateUIMessages,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { chatStore } from "@/lib/ai/chat-store";
import { chatModel } from "@/lib/ai/model";
import { systemPrompt } from "@/lib/ai/prompt";
import { scopedTools } from "@/lib/ai/scope";
import { readTools } from "@/lib/ai/tools";
import { incomingMetadataSchema, type ChatUIMessage } from "@/lib/ai/types";
import { writeTools } from "@/lib/ai/write-tools";
import { requireApiUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const body = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  messages: z.array(z.unknown()).min(1).max(200),
});

export const POST = route(async (req: Request) => {
  const user = await requireApiUser();
  await rateLimit("chat", 30, 60);
  const model = chatModel();
  if (!model) throw new HttpError(503, "AI is not configured. Set DEEPSEEK_API_KEY.");

  const { id, messages: raw } = body.parse(await req.json());
  const store = chatStore(user._id);
  const session = await store.ensure(id);
  const tools = scopedTools({ ...readTools(user._id), ...writeTools(user._id) });

  let messages: ChatUIMessage[];
  try {
    messages = await validateUIMessages<ChatUIMessage>({ messages: raw, tools, metadataSchema: incomingMetadataSchema });
  } catch (e) {
    if (e instanceof TypeValidationError) throw new HttpError(400, "Invalid chat history");
    throw e;
  }

  const result = streamText({
    model,
    system: systemPrompt({ name: user.name, currency: user.currency, timezone: user.timezone }),
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(8),
    abortSignal: req.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<typeof tools, ChatUIMessage>({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      messageMetadata: ({ part }) => {
        if (part.type === "start") return { createdAt: Date.now(), model: env.LLM_MODEL };
        if (part.type === "finish") {
          return { inputTokens: part.totalUsage.inputTokens, outputTokens: part.totalUsage.outputTokens, totalTokens: part.totalUsage.totalTokens };
        }
      },
      onEnd: async ({ messages: all }) => {
        try {
          await store.save(id, all);
          if (session.title === "New chat") await autoTitle(id, all, store);
        } catch (e) {
          console.error("[chat] save failed", (e as Error).message);
        }
      },
    }),
  });
});

async function autoTitle(id: string, messages: ChatUIMessage[], store: ReturnType<typeof chatStore>) {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").slice(0, 500);
  if (!text) return;
  let title = text.slice(0, 60);
  const model = chatModel();
  if (model) {
    try {
      const r = await generateText({
        model,
        prompt: `Write a 3-6 word title for a chat that starts with this question. Reply with the title only, no quotes.\n\n${text}`,
        maxOutputTokens: 30,
        providerOptions: { deepseek: { thinking: { type: "disabled" } } },
      });
      title = r.text.trim().replace(/^["']|["']$/g, "").slice(0, 80) || title;
    } catch {
      // keep the fallback title
    }
  }
  await store.rename(id, title);
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
