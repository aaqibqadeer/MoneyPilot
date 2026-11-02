import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

const PUBLIC = [/^\/login$/, /^\/signup$/, /^\/recover$/, /^\/api\/auth\//, /^\/api\/plaid\/webhook$/, /^\/api\/cron\//];

/** Optimistic gate: no session cookie → /login (pages) or 401 (API). Real validation is in getCurrentUser(). Demo mode is open. */
function gate(req: NextRequest) {
  if (!process.env.MONGODB_URI) return null;
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname)) || req.cookies.has("mp_session")) return null;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

/** Auth gate plus a per-request CSP nonce (read by the root layout via `x-nonce`). */
export function proxy(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|ico|webp)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
    },
  ],
};
