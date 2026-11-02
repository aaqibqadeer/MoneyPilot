import { NextResponse } from "next/server";
import { getBankProvider } from "@/lib/bank/plaid";
import { handlePlaidWebhook } from "@/lib/bank/sync";

export const maxDuration = 60;

/** Plaid webhooks: signature-verified, then dispatched. Always 200 after verification so Plaid doesn't retry storms. */
export async function POST(req: Request) {
  const p = getBankProvider();
  if (!p) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const raw = await req.text();
  const ok = await p.verifyWebhook(raw, req.headers.get("plaid-verification")).catch(() => false);
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  try {
    await handlePlaidWebhook(JSON.parse(raw));
  } catch (e) {
    console.error("[plaid webhook]", (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
