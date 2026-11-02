import { z } from "zod";

/** All ids are strings (uuid). Money is integer cents; positive = money out. */
export const id = z.string().min(1);
const cents = z.number().int();
const date = z.coerce.date();
const base = { _id: id, createdAt: date, updatedAt: date };
const owned = { ...base, userId: id };

export const userSchema = z.object({
  ...base,
  email: z.string().email().optional(),
  name: z.string().default(""),
  currency: z.string().default("USD"),
  timezone: z.string().default("America/New_York"),
  theme: z.string().default("calm"),
  mode: z.enum(["light", "dark", "system"]).default("light"),
});

export const passkeySchema = z.object({
  ...owned,
  credentialId: z.string(),
  publicKey: z.string(), // base64url
  counter: z.number().int(),
  transports: z.array(z.string()).default([]),
  name: z.string().default("Passkey"),
  lastUsedAt: date.optional(),
});

export const sessionSchema = z.object({
  ...owned,
  tokenHash: z.string(),
  expiresAt: date,
  lastSeenAt: date,
  userAgent: z.string().optional(),
  ip: z.string().optional(),
});

export const recoveryCodeSchema = z.object({ ...owned, codeHash: z.string(), usedAt: date.optional() });

export const magicLinkSchema = z.object({ ...owned, tokenHash: z.string(), expiresAt: date, usedAt: date.optional() });

/** Short-lived WebAuthn challenges, keyed by a random flow id cookie. */
export const authChallengeSchema = z.object({
  _id: id,
  challenge: z.string(),
  userId: z.string().optional(),
  kind: z.enum(["register", "login"]),
  pending: z.object({ name: z.string().optional(), email: z.string().optional() }).optional(),
  expiresAt: date,
});

export const rateLimitSchema = z.object({ _id: id, count: z.number().int(), expiresAt: date });

export const itemSchema = z.object({
  ...owned,
  provider: z.literal("plaid"),
  providerItemId: z.string(),
  accessTokenEnc: z.string(),
  institutionId: z.string().optional(),
  institutionName: z.string().default("Bank"),
  cursor: z.string().optional(),
  status: z.enum(["ok", "needs_reauth", "error"]).default("ok"),
  error: z.string().optional(),
  lastSyncedAt: date.optional(),
});

export const accountSchema = z.object({
  ...owned,
  itemId: id,
  providerAccountId: z.string(),
  name: z.string(),
  officialName: z.string().optional(),
  mask: z.string().optional(),
  type: z.string(), // depository | credit | loan | investment | other
  subtype: z.string().optional(),
  currentCents: cents.optional(),
  availableCents: cents.optional(),
  limitCents: cents.optional(),
  currency: z.string().default("USD"),
});

export const transactionSchema = z.object({
  ...owned,
  accountId: z.string().optional(),
  providerTransactionId: z.string().optional(),
  pendingTransactionId: z.string().optional(),
  source: z.enum(["plaid", "manual", "import"]),
  date: date,
  amountCents: cents,
  currency: z.string().default("USD"),
  name: z.string(), // raw provider name
  merchant: z.string().optional(),
  description: z.string().optional(), // user override
  notes: z.string().optional(),
  category: z.string().optional(), // provider primary category
  categoryDetailed: z.string().optional(),
  tagIds: z.array(id).default([]),
  pending: z.boolean().default(false),
  deletedAt: date.optional(),
  /** Set when imported from a document (Phase 8). */
  documentId: z.string().optional(),
  raw: z.unknown().optional(),
});

export const liabilitySchema = z.object({
  ...owned,
  accountId: id,
  kind: z.enum(["credit", "student", "mortgage"]),
  lastStatementBalanceCents: cents.optional(),
  minimumPaymentCents: cents.optional(),
  nextPaymentDueDate: date.optional(),
  lastPaymentDate: date.optional(),
  lastPaymentCents: cents.optional(),
  aprPercent: z.number().optional(),
  raw: z.unknown().optional(),
});

export const billSchema = z.object({
  ...owned,
  name: z.string(),
  amountCents: cents.optional(),
  dueDate: date,
  source: z.enum(["liability", "manual", "recurring"]),
  accountId: z.string().optional(),
  status: z.enum(["upcoming", "paid", "overdue"]).default("upcoming"),
  recurrence: z.enum(["none", "weekly", "monthly", "yearly"]).default("none"),
  paidTransactionId: z.string().optional(),
});

export const tagSchema = z.object({
  ...owned,
  name: z.string().min(1),
  color: z.string().default("#64748b"),
  parentId: z.string().optional(),
});

export const tagRuleSchema = z.object({
  ...owned,
  field: z.enum(["name", "merchant", "description"]).default("name"),
  match: z.enum(["contains", "equals", "regex"]),
  pattern: z.string().min(1),
  tagIds: z.array(id),
  enabled: z.boolean().default(true),
});

export const claimSchema = z.object({
  ...owned,
  title: z.string(),
  kind: z.enum(["insurance", "reimbursement", "refund", "warranty", "other"]).default("other"),
  counterparty: z.string().optional(),
  status: z.enum(["draft", "submitted", "in_review", "approved", "paid", "denied", "closed"]).default("draft"),
  claimedCents: cents.optional(),
  approvedCents: cents.optional(),
  paidCents: cents.optional(),
  submittedAt: date.optional(),
  deadlineAt: date.optional(),
  transactionIds: z.array(id).default([]),
  documentIds: z.array(id).default([]),
  timeline: z.array(z.object({ at: date, note: z.string() })).default([]),
  notes: z.string().optional(),
});

export const documentSchema = z.object({
  ...owned,
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  blobUrl: z.string().optional(),
  status: z.enum(["uploaded", "parsing", "parsed", "imported", "failed"]).default("uploaded"),
  extracted: z.unknown().optional(),
  error: z.string().optional(),
  /** The import changeSet, once imported. */
  changeSetId: z.string().optional(),
});

export const chatSessionSchema = z.object({
  ...owned,
  title: z.string().default("New chat"),
  pinned: z.boolean().default(false),
  lastMessageAt: date,
});

export const chatMessageSchema = z.object({
  ...owned,
  sessionId: id,
  role: z.enum(["user", "assistant", "system"]),
  /** AI SDK UIMessage parts, including tool calls and results. */
  parts: z.array(z.unknown()),
  usage: z
    .object({ inputTokens: z.number().optional(), outputTokens: z.number().optional(), totalTokens: z.number().optional() })
    .optional(),
  model: z.string().optional(),
});

export const changeOpSchema = z.object({
  collection: z.string(),
  docId: id,
  kind: z.enum(["create", "update", "delete"]),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});

export const changeSetSchema = z.object({
  ...owned,
  summary: z.string(),
  origin: z.enum(["user", "chat", "autotag", "import"]),
  status: z.enum(["proposed", "applied", "rejected", "reverted"]),
  ops: z.array(changeOpSchema),
  appliedAt: date.optional(),
  revertedAt: date.optional(),
});

export const auditLogSchema = z.object({
  ...owned,
  action: z.string(),
  changeSetId: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export const schemas = {
  users: userSchema,
  passkeys: passkeySchema,
  sessions: sessionSchema,
  recoveryCodes: recoveryCodeSchema,
  magicLinks: magicLinkSchema,
  authChallenges: authChallengeSchema,
  rateLimits: rateLimitSchema,
  items: itemSchema,
  accounts: accountSchema,
  transactions: transactionSchema,
  liabilities: liabilitySchema,
  bills: billSchema,
  tags: tagSchema,
  tagRules: tagRuleSchema,
  claims: claimSchema,
  documents: documentSchema,
  chatSessions: chatSessionSchema,
  chatMessages: chatMessageSchema,
  changeSets: changeSetSchema,
  auditLog: auditLogSchema,
} as const;

export type CollectionName = keyof typeof schemas;
export type Doc<C extends CollectionName> = z.infer<(typeof schemas)[C]>;
export type User = Doc<"users">;
export type Passkey = Doc<"passkeys">;
export type Session = Doc<"sessions">;
export type Item = Doc<"items">;
export type Account = Doc<"accounts">;
export type Transaction = Doc<"transactions">;
export type Liability = Doc<"liabilities">;
export type Bill = Doc<"bills">;
export type Tag = Doc<"tags">;
export type Claim = Doc<"claims">;
export type ChatSession = Doc<"chatSessions">;
export type ChatMessage = Doc<"chatMessages">;

/** Collections that hold per-user data (everything but auth plumbing). */
export const USER_SCOPED: CollectionName[] = [
  "passkeys",
  "sessions",
  "recoveryCodes",
  "magicLinks",
  "items",
  "accounts",
  "transactions",
  "liabilities",
  "bills",
  "tags",
  "tagRules",
  "claims",
  "documents",
  "chatSessions",
  "chatMessages",
  "changeSets",
  "auditLog",
];
