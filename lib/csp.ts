/**
 * Content Security Policy (CLAUDE.md §10). Per-request nonce set in proxy.ts; Next applies it to its
 * own scripts. 'strict-dynamic' lets trusted scripts load Plaid Link. Styles stay 'unsafe-inline'
 * (Tailwind/Recharts style attributes); 'wasm-unsafe-eval' is for the code highlighter.
 */
export function buildCsp(nonce: string, dev = process.env.NODE_ENV === "development") {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.plaid.com",
    "frame-src https://*.plaid.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
