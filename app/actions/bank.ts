"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { archiveItem } from "@/lib/bank/sync";

type Result = { ok: true; message: string } | { ok: false; error: string };

/** Disconnects a bank (Plaid item/remove) and archives it; its data stays fully viewable. */
export async function removeBank(itemId: string): Promise<Result> {
  const user = await requireUser();
  try {
    const r = await archiveItem(user._id, itemId);
    refresh();
    return { ok: true, message: `${r.institution} disconnected and archived. Its history is still here.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not remove the bank" };
  }
}
