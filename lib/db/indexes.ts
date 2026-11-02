import type { IndexDescription } from "mongodb";
import type { CollectionName } from "./schemas";

/** Index definitions for every collection. Applied by `pnpm db:indexes`. */
export const INDEXES: Partial<Record<CollectionName, IndexDescription[]>> = {
  users: [{ key: { email: 1 }, unique: true, sparse: true }],
  passkeys: [{ key: { credentialId: 1 }, unique: true }, { key: { userId: 1 } }],
  sessions: [{ key: { tokenHash: 1 }, unique: true }, { key: { userId: 1 } }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
  recoveryCodes: [{ key: { userId: 1 } }, { key: { codeHash: 1 } }],
  magicLinks: [{ key: { tokenHash: 1 }, unique: true }, { key: { expiresAt: 1 }, expireAfterSeconds: 86400 }],
  authChallenges: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
  rateLimits: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
  items: [{ key: { userId: 1 } }, { key: { providerItemId: 1 }, unique: true }],
  accounts: [{ key: { userId: 1, itemId: 1 } }, { key: { userId: 1, providerAccountId: 1 }, unique: true }],
  transactions: [
    { key: { userId: 1, date: -1 } },
    { key: { userId: 1, accountId: 1, date: -1 } },
    { key: { userId: 1, tagIds: 1 } },
    { key: { userId: 1, providerTransactionId: 1 }, unique: true, partialFilterExpression: { providerTransactionId: { $type: "string" } } },
    { key: { name: "text", merchant: "text", description: "text", notes: "text" } },
  ],
  liabilities: [{ key: { userId: 1, accountId: 1 }, unique: true }],
  bills: [{ key: { userId: 1, dueDate: 1 } }],
  tags: [{ key: { userId: 1, name: 1 }, unique: true }],
  tagRules: [{ key: { userId: 1 } }],
  claims: [{ key: { userId: 1, status: 1 } }],
  documents: [{ key: { userId: 1, createdAt: -1 } }],
  chatSessions: [{ key: { userId: 1, lastMessageAt: -1 } }],
  chatMessages: [{ key: { userId: 1, sessionId: 1, createdAt: 1 } }],
  changeSets: [{ key: { userId: 1, createdAt: -1 } }],
  auditLog: [{ key: { userId: 1, createdAt: -1 } }],
};
