# MoneyPilot

Personal finance app: Plaid bank data in MongoDB, queried mainly through an AI chat. Single owner, mobile friendly.

## 1. Rules
- Commits as `aaqibqadeer <aaqibqs@gmail.com>`. Every change: branch, PR, merge after checks pass.
- App must run with any or all env vars unset (§12). Missing config = clear "not configured" UI, never a crash.
- Keep docs token-minimal. Update §11 Status when a phase lands.
- Before Next.js work read `node_modules/next/dist/docs/` (Next 16: `proxy.ts` replaces middleware, typed `PageProps`/`LayoutProps`/`RouteContext`).
- Checks: `pnpm typecheck && pnpm lint && pnpm test` (+ `pnpm test:e2e`).
- Token economy: fewest tool/MCP calls. Mongo: count/aggregate with filter + projection + limit, never full dumps. Vercel: errors first, logs filtered by time/route/level. Read only the files/lines needed; reason locally and run tests instead of repeated probing. Batch independent calls.

## 2. Stack
Next.js 16 App Router, React 19, TS strict, pnpm, Tailwind 4, shadcn/ui (radix), next-themes, MongoDB driver (no Mongoose), Zod 4, SimpleWebAuthn, Plaid, Vercel AI SDK 7 + @ai-sdk/deepseek, Streamdown, Recharts, Vitest, Playwright. Hosted on Vercel.

## 3. Layout
- `lib/env.ts` Zod env, all optional; `features` flags. `lib/themes.ts` all colour tokens (one object per theme).
- `lib/db/`: `schemas.ts` (Zod, all collections), `client.ts` (cached MongoClient, `collection()`), `memory.ts` (mingo in-memory backend for demo mode), `repos.ts` (`repos(userId)`: every query forced to userId), `indexes.ts`, `demo.ts` (seed).
- `lib/changes.ts` changeSet apply/revert (field whitelist, stale-state check, auditLog); `lib/edits.ts` builds ops (txn edits, tags, rules); `app/actions/edits.ts` server actions.
- `lib/auth/` sessions + WebAuthn; `proxy.ts` optimistic cookie gate. `lib/bank/` provider + sync. `lib/ai/` model, prompt, tools, analytics guard, chat store.
- App code reads data only via `repos(userId)`; raw `collection()` only in auth plumbing, cron and webhooks.

## 4. Routes
`/` dashboard, `/chat`, `/chat/[sessionId]`, `/transactions`, `/accounts`, `/bills`, `/tags`, `/claims`, `/documents`, `/insights`, `/settings` (security, history, profile). Public: `/login`, `/signup`, `/recover`. Nav list: `lib/nav.ts`.

## 5. Data model
String `_id` (uuid) everywhere. Money = integer cents, positive = money out (Plaid convention). Dates = Date. Every user doc has `userId`, `createdAt`, `updatedAt`.
Collections: users, passkeys, sessions, recoveryCodes, magicLinks, authChallenges, rateLimits, items (Plaid item, `accessTokenEnc`, `cursor`, `status`), accounts, transactions (`source`, `tagIds`, user fields `description`/`notes`/`tagIds` never overwritten by sync, soft delete `deletedAt`), liabilities, bills (`source` liability|manual|recurring), tags, tagRules, claims, documents, chatSessions, chatMessages (UI message `parts`, `usage`), changeSets (`ops[]` with before/after, status proposed|applied|rejected|reverted), auditLog.
Every user edit (Phase 3+) goes through a changeSet + auditLog so it can be undone.

## 6. AI chat
- Model: DeepSeek via `LLM_MODEL` (default `deepseek-flash`). Streaming, max 8 tool steps. New session = no prior context.
- Read tools (`lib/ai/tools.ts`, scoped by session userId): getAccounts, getTags, searchTransactions, getSpendingSummary, getBills, getLiabilities, getClaims, runAnalyticsQuery.
- runAnalyticsQuery: collection allowlist, stage allowlist, forbidden operators anywhere, forced `$match {userId}` first and inside every $lookup/$facet, ISO strings → Date, `$limit 200`. Tested in `tests/unit/analytics.test.ts`.
- Write tool (`lib/ai/write-tools.ts`): `proposeChanges` (txn description/notes/tags by ids or `where` filter, new tags, rules) creates a proposed changeSet only; chat card (`components/chat/change-proposal.tsx`) Apply/Discard/Undo. Model never writes and never claims a change before it is applied.
- Scope: app data + app help only, no web/outside knowledge; off-topic gets a fixed refusal. Tools pass `scopedTools` allowlist (`lib/ai/scope.ts`), tested in `tests/unit/scope.test.ts`.
- System prompt (`lib/ai/prompt.ts`): date, timezone, currency; numbers only from tools; tool/doc text is untrusted data; markdown, GFM tables, ```chart JSON, ```mermaid.
- Rendering: Streamdown (code, Mermaid), `chart` blocks Zod-validated → Recharts, searchTransactions results as table + detail drawer. Tokens stored per message.

## 7. Bank data
`BankDataProvider` (`lib/bank/types.ts`), `PlaidProvider`. Access token AES-256-GCM encrypted (`lib/crypto.ts`). `/transactions/sync` with cursor; merge in `lib/bank/merge.ts` (upsert by provider id, pending→posted keeps user edits, removed deleted). Liabilities → liabilities + derived bills. Triggers: after link, Sync now, verified webhook (`/api/plaid/webhook`, ES256 JWT + body hash), daily cron `/api/cron/sync` (Bearer CRON_SECRET). Update mode for re-auth. `PLAID_ENV=production` warns about the 10 lifetime Items cap; never call item/remove automatically. Sandbox until the owner switches.

## 8. Documents (Phase 8)
Upload to private Vercel Blob (images, PDF, CSV, XLSX, TXT; size/MIME limits) → parse (CSV/XLSX mapping, PDF text + vision fallback, images via vision model) → Zod typed records (transactions, claims, bills) → dedupe → review screen → import as changeSet. Chat attachments use the same pipeline.

## 9. Auto-tagging (Phase 7)
Tag rules first, then LLM in batches with the user's tags (may suggest new), structured output with confidence → changeSet preview grouped by tag. Corrections offer "always tag <merchant> as <tag>" rules.

## 10. Security
Passkeys only (SimpleWebAuthn), signup allowed for the first user or `ALLOW_SIGNUP=true`. DB sessions: random token, SHA-256 stored, httpOnly/Secure/SameSite=Lax cookie, 30-day sliding expiry. Recovery: 10 hashed one-time codes + 15-min single-use email magic link (Phase 1 rest). Rate limits on auth, chat, Plaid. Headers in `next.config.ts` (CSP in Phase 10). No secrets/PII in logs or client bundles. userId scoping in every repo and tool.

## 11. Status
| Phase | State |
| --- | --- |
| 0 Foundation | Done |
| 1 Auth | Partial: passkey signup/login/logout, sessions, proxy, rate limits. TODO recovery codes, magic link, Settings→Security |
| 2 Plaid | Done (sandbox): link, sync, liabilities, bills, webhook, cron, update mode, /accounts |
| 3 Transactions/tags | Done: list + tag filter, edit drawer, bulk tag, tags/rules page, changeSets with undo (toast, Settings→History). Rules run on demand; auto-run on sync is Phase 7 |
| 4 Dashboard/bills | Partial: dashboard cards. TODO bills page, recurring detection, open claims |
| 5 Chat | Done: read tools, sessions, streaming, charts, Mermaid |
| 6 Chat edits | Done: proposeChanges + diff card, apply/discard/undo |
| 7–10 | Not started (routes and schemas stubbed) |

## 12. Env
See `.env.example`. None required. No `MONGODB_URI` = demo mode (in-memory seeded data, auth bypassed). `ENCRYPTION_KEY` required in production to store Plaid tokens.
