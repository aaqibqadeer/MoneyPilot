import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login$/, /^\/signup$/, /^\/recover$/, /^\/api\/auth\//, /^\/api\/plaid\/webhook$/, /^\/api\/cron\//];

/**
 * Optimistic gate: no session cookie → /login (pages) or 401 (API).
 * Real validation happens in getCurrentUser(). Demo mode (no DB) is open.
 */
export function proxy(req: NextRequest) {
  if (!process.env.MONGODB_URI) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (req.cookies.has("mp_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
