"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { removeItem } from "@/lib/bank/sync";

type Result = { ok: true; message: string } | { ok: false; error: string };

/** Disconnects a bank (Plaid item/remove) and deletes its synced data. */
export async function removeBank(itemId: string): Promise<Result> {
  const user = await requireUser();
  try {
    const r = await removeItem(user._id, itemId);
    refresh();
    return { ok: true, message: `Removed ${r.institution} and ${r.transactions} synced transactions` };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not remove the bank" };
  }
}
