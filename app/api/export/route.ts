import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { repos } from "@/lib/db/repos";
import { rateLimit } from "@/lib/rate-limit";

/** Everything the user owns as JSON, minus secrets (tokens, key material, raw provider payloads). */
const EXPORT = ["accounts", "transactions", "liabilities", "bills", "tags", "tagRules", "claims", "documents", "chatSessions", "chatMessages", "changeSets", "auditLog"] as const;
const OMIT: Record<string, Record<string, 0>> = { transactions: { raw: 0 }, liabilities: { raw: 0 } };

export const GET = route(async () => {
  const user = await requireApiUser();
  await rateLimit("export", 5, 60);
  const db = repos(user._id);
  const data: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    profile: { name: user.name, email: user.email, currency: user.currency, timezone: user.timezone, createdAt: user.createdAt },
    connections: (await db.items.find({}, { projection: { accessTokenEnc: 0, cursor: 0 } })).map((i) => ({ institution: i.institutionName, status: i.status, lastSyncedAt: i.lastSyncedAt })),
  };
  for (const c of EXPORT) data[c] = await db[c].find({}, OMIT[c] ? { projection: OMIT[c] } : undefined);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="moneypilot-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});
