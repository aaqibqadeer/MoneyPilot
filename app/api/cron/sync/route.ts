import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { getBankProvider } from "@/lib/bank/plaid";
import { syncAllItems } from "@/lib/bank/sync";
import { env } from "@/lib/env";

export const maxDuration = 300;

/** Daily Vercel Cron. Requires `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${env.CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!getBankProvider()) return NextResponse.json({ skipped: "Plaid not configured" });
  const results = await syncAllItems();
  return NextResponse.json({ items: results.length, errors: results.filter((r) => r.error).length });
}
