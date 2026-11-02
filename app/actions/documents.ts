"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { commit } from "@/lib/changes";
import { repos } from "@/lib/db/repos";
import { planImport } from "@/lib/documents/service";
import { features } from "@/lib/env";

type Result = { ok: true; changeSetId?: string; count?: number } | { ok: false; error: string };

async function run(fn: (userId: string, currency: string) => Promise<Omit<Extract<Result, { ok: true }>, "ok">>): Promise<Result> {
  const user = await requireUser();
  try {
    const r = await fn(user._id, user.currency);
    refresh();
    return { ok: true, ...r };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (e instanceof z.ZodError) return { ok: false, error: "Invalid input" };
    if (status && status < 500) return { ok: false, error: (e as Error).message };
    console.error("[documents]", (e as Error).message);
    return { ok: false, error: "Something went wrong" };
  }
}

const id = z.string().min(1).max(100);
const idx = z.array(z.number().int().min(0).max(1000)).max(1000);

/** Imports the picked records as one undoable "import" changeSet. */
export async function importDocument(documentId: string, pick: { transactions: number[]; bills: number[]; claims: number[]; accountId?: string }) {
  return run(async (userId, currency) => {
    const p = z.object({ transactions: idx, bills: idx, claims: idx, accountId: id.optional() }).parse(pick);
    const { doc, ops } = await planImport(userId, id.parse(documentId), p, currency);
    const changeSetId = await commit(userId, `Imported ${ops.length} item${ops.length === 1 ? "" : "s"} from ${doc.fileName}`, ops, "import");
    await repos(userId).documents.updateOne({ _id: doc._id }, { $set: { status: "imported", changeSetId } });
    return { changeSetId, count: ops.length };
  });
}

/** Deletes the file and its record. Imported records stay (undo the import from History to remove them). */
export async function deleteDocument(documentId: string) {
  return run(async (userId) => {
    const db = repos(userId);
    const doc = await db.documents.byId(id.parse(documentId));
    if (!doc) return {};
    if (doc.blobUrl && features.blob) {
      try {
        const { del } = await import("@vercel/blob");
        await del(doc.blobUrl);
      } catch (e) {
        console.error("[documents] blob delete failed", (e as Error).message);
      }
    }
    await db.documents.deleteOne({ _id: doc._id });
    await db.auditLog.insert({ action: "document.delete", detail: { fileName: doc.fileName } });
    return {};
  });
}
