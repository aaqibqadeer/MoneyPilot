import "server-only";
import { headers } from "next/headers";
import { collection } from "@/lib/db/client";

export class RateLimitError extends Error {
  status = 429;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Fixed-window limiter stored in the DB (or memory in demo mode). Throws RateLimitError. */
export async function rateLimit(scope: string, limit = 10, windowSec = 60) {
  const windowStart = Math.floor(Date.now() / (windowSec * 1000));
  const key = `${scope}:${await clientIp()}:${windowStart}`;
  const c = collection("rateLimits");
  await c.updateOne(
    { _id: key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((windowStart + 1) * windowSec * 1000) } },
    { upsert: true },
  );
  const doc = await c.findOne({ _id: key });
  if ((doc?.count ?? 0) > limit) throw new RateLimitError("Too many requests, try again shortly.");
}
