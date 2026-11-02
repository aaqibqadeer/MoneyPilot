import "server-only";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { env } from "@/lib/env";

/** Null when DEEPSEEK_API_KEY is unset; chat shows a setup card instead. */
export function chatModel() {
  if (!env.DEEPSEEK_API_KEY) return null;
  return createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY })(env.LLM_MODEL);
}
