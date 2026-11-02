/** Provider-neutral shapes. PlaidProvider maps Plaid responses into these. */
export interface ProviderAccount {
  providerAccountId: string;
  name: string;
  officialName?: string;
  mask?: string;
  type: string;
  subtype?: string;
  currentCents?: number;
  availableCents?: number;
  limitCents?: number;
  currency: string;
}

export interface ProviderTransaction {
  providerTransactionId: string;
  providerAccountId: string;
  pendingTransactionId?: string;
  date: Date;
  amountCents: number; // positive = money out
  currency: string;
  name: string;
  merchant?: string;
  category?: string;
  categoryDetailed?: string;
  pending: boolean;
  raw: unknown;
}

export interface ProviderLiability {
  providerAccountId: string;
  kind: "credit" | "student" | "mortgage";
  lastStatementBalanceCents?: number;
  minimumPaymentCents?: number;
  nextPaymentDueDate?: Date;
  lastPaymentDate?: Date;
  lastPaymentCents?: number;
  aprPercent?: number;
  raw: unknown;
}

export interface SyncPage {
  added: ProviderTransaction[];
  modified: ProviderTransaction[];
  removed: string[];
  nextCursor: string;
}

export interface BankDataProvider {
  readonly name: "plaid";
  createLinkToken(userId: string, opts?: { accessToken?: string }): Promise<string>;
  exchangePublicToken(publicToken: string): Promise<{ accessToken: string; providerItemId: string }>;
  getInstitution(accessToken: string): Promise<{ id?: string; name: string }>;
  getAccounts(accessToken: string): Promise<ProviderAccount[]>;
  /** Pages through /transactions/sync until has_more is false. */
  syncTransactions(accessToken: string, cursor?: string): Promise<SyncPage>;
  getLiabilities(accessToken: string): Promise<ProviderLiability[]>;
  verifyWebhook(rawBody: string, jwt: string | null): Promise<boolean>;
  /** Revokes the access token at the provider (user-initiated only). */
  removeItem(accessToken: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public code?: string,
    public needsReauth = false,
  ) {
    super(message);
  }
}
