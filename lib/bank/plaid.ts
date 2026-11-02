import "server-only";
import { createHash, createPublicKey, verify as verifySig, type JsonWebKey } from "node:crypto";
import {
  Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products,
  type LinkTokenCreateRequest, type Transaction as PlaidTxn,
} from "plaid";
import { env } from "@/lib/env";
import { toCents } from "./merge";
import { ProviderError, type BankDataProvider, type ProviderLiability, type ProviderTransaction, type SyncPage } from "./types";

const d = (s?: string | null) => (s ? new Date(`${s}T12:00:00Z`) : undefined);

function mapTxn(t: PlaidTxn): ProviderTransaction {
  return {
    providerTransactionId: t.transaction_id,
    providerAccountId: t.account_id,
    pendingTransactionId: t.pending_transaction_id ?? undefined,
    date: d(t.date)!,
    amountCents: toCents(t.amount)!,
    currency: t.iso_currency_code ?? t.unofficial_currency_code ?? "USD",
    name: t.name,
    merchant: t.merchant_name ?? undefined,
    category: t.personal_finance_category?.primary,
    categoryDetailed: t.personal_finance_category?.detailed,
    pending: t.pending,
    raw: t,
  };
}

function wrap(e: unknown): never {
  const data = (e as { response?: { data?: { error_code?: string; error_message?: string } } }).response?.data;
  const code = data?.error_code;
  throw new ProviderError(data?.error_message ?? "Bank provider request failed", code, code === "ITEM_LOGIN_REQUIRED");
}

export class PlaidProvider implements BankDataProvider {
  readonly name = "plaid" as const;
  private api: PlaidApi;
  private keyCache = new Map<string, { jwk: JsonWebKey; at: number }>();

  constructor() {
    if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) throw new ProviderError("Plaid is not configured");
    this.api = new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments[env.PLAID_ENV],
        baseOptions: { headers: { "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID, "PLAID-SECRET": env.PLAID_SECRET } },
      }),
    );
  }

  async createLinkToken(userId: string, opts: { accessToken?: string } = {}) {
    const req: LinkTokenCreateRequest = {
      user: { client_user_id: userId },
      client_name: "MoneyPilot",
      language: "en",
      country_codes: [CountryCode.Us],
      ...(opts.accessToken
        ? { access_token: opts.accessToken } // update mode
        : { products: [Products.Transactions], optional_products: [Products.Liabilities], transactions: { days_requested: 730 } }),
      ...(env.PLAID_WEBHOOK_URL ? { webhook: env.PLAID_WEBHOOK_URL } : {}),
    };
    try {
      return (await this.api.linkTokenCreate(req)).data.link_token;
    } catch (e) {
      wrap(e);
    }
  }

  async exchangePublicToken(publicToken: string) {
    try {
      const r = await this.api.itemPublicTokenExchange({ public_token: publicToken });
      return { accessToken: r.data.access_token, providerItemId: r.data.item_id };
    } catch (e) {
      wrap(e);
    }
  }

  async getInstitution(accessToken: string) {
    try {
      const item = (await this.api.itemGet({ access_token: accessToken })).data.item;
      if (!item.institution_id) return { name: "Bank" };
      const inst = await this.api.institutionsGetById({ institution_id: item.institution_id, country_codes: [CountryCode.Us] });
      return { id: item.institution_id, name: inst.data.institution.name };
    } catch {
      return { name: "Bank" };
    }
  }

  async getAccounts(accessToken: string) {
    try {
      const r = await this.api.accountsGet({ access_token: accessToken });
      return r.data.accounts.map((a) => ({
        providerAccountId: a.account_id,
        name: a.name,
        officialName: a.official_name ?? undefined,
        mask: a.mask ?? undefined,
        type: a.type,
        subtype: a.subtype ?? undefined,
        currentCents: toCents(a.balances.current),
        availableCents: toCents(a.balances.available),
        limitCents: toCents(a.balances.limit),
        currency: a.balances.iso_currency_code ?? "USD",
      }));
    } catch (e) {
      wrap(e);
    }
  }

  async syncTransactions(accessToken: string, cursor?: string): Promise<SyncPage> {
    const out: SyncPage = { added: [], modified: [], removed: [], nextCursor: cursor ?? "" };
    let next = cursor;
    try {
      for (let page = 0; page < 50; page++) {
        const r = (await this.api.transactionsSync({ access_token: accessToken, cursor: next, count: 500 })).data;
        out.added.push(...r.added.map(mapTxn));
        out.modified.push(...r.modified.map(mapTxn));
        out.removed.push(...r.removed.map((x) => x.transaction_id));
        next = r.next_cursor;
        if (!r.has_more) break;
      }
    } catch (e) {
      // TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION: caller retries from the original cursor
      wrap(e);
    }
    out.nextCursor = next ?? "";
    return out;
  }

  async getLiabilities(accessToken: string): Promise<ProviderLiability[]> {
    try {
      const l = (await this.api.liabilitiesGet({ access_token: accessToken })).data.liabilities;
      const credit = (l.credit ?? []).map((c) => ({
        providerAccountId: c.account_id ?? "",
        kind: "credit" as const,
        lastStatementBalanceCents: toCents(c.last_statement_balance),
        minimumPaymentCents: toCents(c.minimum_payment_amount),
        nextPaymentDueDate: d(c.next_payment_due_date),
        lastPaymentDate: d(c.last_payment_date),
        lastPaymentCents: toCents(c.last_payment_amount),
        aprPercent: c.aprs?.find((a) => a.apr_type === "purchase_apr")?.apr_percentage ?? c.aprs?.[0]?.apr_percentage,
        raw: c,
      }));
      const student = (l.student ?? []).map((s) => ({
        providerAccountId: s.account_id ?? "",
        kind: "student" as const,
        minimumPaymentCents: toCents(s.minimum_payment_amount),
        nextPaymentDueDate: d(s.next_payment_due_date),
        lastPaymentDate: d(s.last_payment_date),
        lastPaymentCents: toCents(s.last_payment_amount),
        aprPercent: s.interest_rate_percentage,
        raw: s,
      }));
      const mortgage = (l.mortgage ?? []).map((m) => ({
        providerAccountId: m.account_id,
        kind: "mortgage" as const,
        minimumPaymentCents: toCents(m.next_monthly_payment),
        nextPaymentDueDate: d(m.next_payment_due_date),
        lastPaymentDate: d(m.last_payment_date),
        lastPaymentCents: toCents(m.last_payment_amount),
        aprPercent: m.interest_rate?.percentage ?? undefined,
        raw: m,
      }));
      return [...credit, ...student, ...mortgage].filter((x) => x.providerAccountId);
    } catch (e) {
      const code = (e as { response?: { data?: { error_code?: string } } }).response?.data?.error_code;
      if (code === "PRODUCTS_NOT_SUPPORTED" || code === "NO_LIABILITY_ACCOUNTS") return [];
      wrap(e);
    }
  }

  /** Plaid signs webhooks with an ES256 JWT carrying the body's SHA-256. */
  async verifyWebhook(rawBody: string, jwt: string | null) {
    if (!jwt) return false;
    const [h, p, s] = jwt.split(".");
    if (!h || !p || !s) return false;
    const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg?: string; kid?: string };
    if (header.alg !== "ES256" || !header.kid) return false;
    let cached = this.keyCache.get(header.kid);
    if (!cached || Date.now() - cached.at > 24 * 3600 * 1000) {
      const k = (await this.api.webhookVerificationKeyGet({ key_id: header.kid })).data.key;
      if (k.expired_at) return false;
      cached = { jwk: k as unknown as JsonWebKey, at: Date.now() };
      this.keyCache.set(header.kid, cached);
    }
    const ok = verifySig(
      "sha256",
      Buffer.from(`${h}.${p}`),
      { key: createPublicKey({ key: cached.jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" },
      Buffer.from(s, "base64url"),
    );
    if (!ok) return false;
    const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as { iat?: number; request_body_sha256?: string };
    if (!claims.iat || Math.abs(Date.now() / 1000 - claims.iat) > 5 * 60) return false;
    return claims.request_body_sha256 === createHash("sha256").update(rawBody).digest("hex");
  }
}

let instance: BankDataProvider | null = null;
/** Null when Plaid keys are missing; callers show a "not configured" state. */
export function getBankProvider(): BankDataProvider | null {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) return null;
  return (instance ??= new PlaidProvider());
}
