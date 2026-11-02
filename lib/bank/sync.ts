import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { collection } from "@/lib/db/client";
import { repos } from "@/lib/db/repos";
import type { Item } from "@/lib/db/schemas";
import { planSync } from "./merge";
import { getBankProvider } from "./plaid";
import { ProviderError } from "./types";

function provider() {
  const p = getBankProvider();
  if (!p) throw new ProviderError("Bank connection is not configured (PLAID_CLIENT_ID / PLAID_SECRET).");
  return p;
}

/** After Link: exchange token, store it encrypted, then run a first sync. */
export async function linkItem(userId: string, publicToken: string) {
  const p = provider();
  const { accessToken, providerItemId } = await p.exchangePublicToken(publicToken);
  const inst = await p.getInstitution(accessToken);
  const db = repos(userId);
  await db.items.updateOne(
    { providerItemId },
    {
      $set: { accessTokenEnc: encrypt(accessToken), institutionId: inst.id, institutionName: inst.name, status: "ok", error: undefined },
      $setOnInsert: { provider: "plaid", providerItemId },
    },
    { upsert: true },
  );
  const item = await db.items.findOne({ providerItemId });
  return syncItem(item!);
}

export interface SyncResult {
  itemId: string;
  added: number;
  modified: number;
  removed: number;
  liabilities: number;
  error?: string;
}

/** Accounts → transactions (cursor) → liabilities → derived bills. Safe to re-run. */
export async function syncItem(item: Item): Promise<SyncResult> {
  const p = provider();
  const db = repos(item.userId);
  const result: SyncResult = { itemId: item._id, added: 0, modified: 0, removed: 0, liabilities: 0 };
  try {
    const token = decrypt(item.accessTokenEnc);

    // 1. accounts + balances
    for (const a of await p.getAccounts(token)) {
      await db.accounts.updateOne(
        { providerAccountId: a.providerAccountId },
        { $set: { ...a, itemId: item._id } },
        { upsert: true },
      );
    }
    const accounts = await db.accounts.find({ itemId: item._id });
    const accountIdByProvider = new Map(accounts.map((a) => [a.providerAccountId, a._id]));

    // 2. transactions via cursor (retry once from the saved cursor if Plaid mutates mid-pagination)
    let page;
    try {
      page = await p.syncTransactions(token, item.cursor);
    } catch (e) {
      if ((e as ProviderError).code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") throw e;
      page = await p.syncTransactions(token, item.cursor);
    }
    const pendingIds = page.added.map((t) => t.pendingTransactionId).filter((x): x is string => !!x);
    const pendingRows = pendingIds.length
      ? await db.transactions.find({ providerTransactionId: { $in: pendingIds } })
      : [];
    const pendingUserFields = new Map(
      pendingRows.map((r) => [r.providerTransactionId!, { description: r.description, notes: r.notes, tagIds: r.tagIds }]),
    );
    const plan = planSync(page.added, page.modified, page.removed, accountIdByProvider, pendingUserFields);
    for (const u of plan.upserts) {
      await db.transactions.updateOne(
        { providerTransactionId: u.providerTransactionId },
        { $set: u.set, $setOnInsert: u.setOnInsert },
        { upsert: true },
      );
    }
    if (plan.deletes.length) await db.transactions.deleteMany({ providerTransactionId: { $in: plan.deletes } });
    Object.assign(result, { added: page.added.length, modified: page.modified.length, removed: page.removed.length });

    // 3. liabilities → derived bills for due dates
    const liabilities = await p.getLiabilities(token);
    for (const l of liabilities) {
      const accountId = accountIdByProvider.get(l.providerAccountId);
      if (!accountId) continue;
      const { providerAccountId: _skip, ...rest } = l;
      void _skip;
      await db.liabilities.updateOne({ accountId }, { $set: { ...rest, accountId } }, { upsert: true });
      if (l.nextPaymentDueDate) {
        const acct = accounts.find((a) => a._id === accountId);
        await db.bills.updateOne(
          { source: "liability", accountId, dueDate: l.nextPaymentDueDate },
          {
            $set: { name: `${acct?.name ?? "Card"} payment`, amountCents: l.lastStatementBalanceCents ?? l.minimumPaymentCents },
            $setOnInsert: { status: "upcoming", recurrence: "monthly" },
          },
          { upsert: true },
        );
      }
    }
    result.liabilities = liabilities.length;

    await db.items.updateOne(
      { _id: item._id },
      { $set: { cursor: page.nextCursor, lastSyncedAt: new Date(), status: "ok" }, $unset: { error: "" } },
    );
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError((e as Error).message);
    result.error = pe.message;
    await db.items.updateOne(
      { _id: item._id },
      { $set: { status: pe.needsReauth ? "needs_reauth" : "error", error: pe.message } },
    );
  }
  return result;
}

export async function syncUser(userId: string) {
  const items = await repos(userId).items.find({});
  return Promise.all(items.filter((i) => i.accessTokenEnc !== "demo").map(syncItem));
}

/** Cron: every item for every user, sequentially to stay gentle on rate limits. */
export async function syncAllItems() {
  const items = await collection("items").find({ accessTokenEnc: { $ne: "demo" } });
  const out: SyncResult[] = [];
  for (const i of items) out.push(await syncItem(i));
  return out;
}

export async function updateLinkToken(userId: string, itemId: string) {
  const item = await repos(userId).items.byId(itemId);
  if (!item) throw new ProviderError("Connection not found");
  return provider().createLinkToken(userId, { accessToken: decrypt(item.accessTokenEnc) });
}

/** Plaid webhook dispatch. Unknown types are ignored. */
export async function handlePlaidWebhook(body: { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { error_message?: string } }) {
  if (!body.item_id) return;
  const item = await collection("items").findOne({ providerItemId: body.item_id });
  if (!item) return;
  const items = repos(item.userId).items;
  const key = `${body.webhook_type}:${body.webhook_code}`;
  if (key === "TRANSACTIONS:SYNC_UPDATES_AVAILABLE" || key === "TRANSACTIONS:DEFAULT_UPDATE" || key === "LIABILITIES:DEFAULT_UPDATE") {
    await syncItem(item);
  } else if (key === "ITEM:ERROR" || key === "ITEM:PENDING_EXPIRATION" || key === "ITEM:PENDING_DISCONNECT") {
    await items.updateOne({ _id: item._id }, { $set: { status: "needs_reauth", error: body.error?.error_message ?? body.webhook_code } });
  } else if (key === "ITEM:LOGIN_REPAIRED") {
    await items.updateOne({ _id: item._id }, { $set: { status: "ok" }, $unset: { error: "" } });
  }
}
