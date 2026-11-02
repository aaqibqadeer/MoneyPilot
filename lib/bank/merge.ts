import type { ProviderTransaction } from "./types";

/** User-owned fields that a provider sync must never overwrite. */
export const USER_FIELDS = ["description", "notes", "tagIds"] as const;
type UserFields = { description?: string; notes?: string; tagIds?: string[] };

export interface TxnUpsert {
  providerTransactionId: string;
  set: Record<string, unknown>;
  /** Only applied when the row is new (carries user edits over from a pending row). */
  setOnInsert: Record<string, unknown>;
}

export interface SyncPlan {
  upserts: TxnUpsert[];
  /** providerTransactionIds to delete (removed, or pending rows replaced by posted). */
  deletes: string[];
}

/**
 * Pure merge of one /transactions/sync result.
 * - added/modified → upsert by providerTransactionId; provider fields only.
 * - a posted txn with pendingTransactionId replaces its pending row, keeping user edits.
 * - removed → delete.
 * Re-running the same page is idempotent (upserts by id), so re-syncs never duplicate.
 */
export function planSync(
  added: ProviderTransaction[],
  modified: ProviderTransaction[],
  removed: string[],
  accountIdByProvider: Map<string, string>,
  pendingUserFields: Map<string, UserFields> = new Map(),
): SyncPlan {
  const upserts = new Map<string, TxnUpsert>();
  const deletes = new Set<string>(removed);

  for (const t of [...added, ...modified]) {
    const carried = t.pendingTransactionId ? pendingUserFields.get(t.pendingTransactionId) : undefined;
    if (t.pendingTransactionId && !t.pending) deletes.add(t.pendingTransactionId);
    upserts.set(t.providerTransactionId, {
      providerTransactionId: t.providerTransactionId,
      set: {
        accountId: accountIdByProvider.get(t.providerAccountId),
        pendingTransactionId: t.pendingTransactionId,
        date: t.date,
        amountCents: t.amountCents,
        currency: t.currency,
        name: t.name,
        merchant: t.merchant,
        category: t.category,
        categoryDetailed: t.categoryDetailed,
        pending: t.pending,
        raw: t.raw,
      },
      setOnInsert: {
        source: "plaid",
        tagIds: carried?.tagIds ?? [],
        ...(carried?.description ? { description: carried.description } : {}),
        ...(carried?.notes ? { notes: carried.notes } : {}),
      },
    });
  }
  // never delete something we are upserting in the same batch
  for (const id of upserts.keys()) deletes.delete(id);
  return { upserts: [...upserts.values()], deletes: [...deletes] };
}

export const toCents = (amount: number | null | undefined) =>
  amount === null || amount === undefined ? undefined : Math.round(amount * 100);
