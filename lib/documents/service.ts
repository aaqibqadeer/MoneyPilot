import "server-only";
import { HttpError } from "@/lib/api";
import { createOp, type ChangeOp } from "@/lib/changes";
import { newId } from "@/lib/db/client";
import { repos } from "@/lib/db/repos";
import { features } from "@/lib/env";
import { extract, fileKind, markDuplicates, MAX_BYTES, type Extracted } from "./extract";

/** Upload → (private Blob if configured) → parse → dedupe → stored for review. Parsing works without Blob. */
export async function uploadDocument(userId: string, file: File) {
  if (file.size > MAX_BYTES) throw new HttpError(413, "Files can be up to 10 MB.");
  if (!file.size) throw new HttpError(400, "That file is empty.");
  const kind = fileKind(file.name, file.type);
  if (!kind) throw new HttpError(415, "Upload a CSV, XLSX, PDF, TXT or image (PNG, JPG, WEBP, HEIC).");
  const db = repos(userId);
  const buf = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `upload.${kind}`;
  const doc = await db.documents.insert({ fileName, mimeType: file.type || kind, sizeBytes: file.size, status: "parsing" });

  let blobUrl: string | undefined;
  if (features.blob) {
    try {
      const { put } = await import("@vercel/blob");
      blobUrl = (await put(`documents/${userId}/${doc._id}/${fileName}`, buf, { access: "private", contentType: file.type || undefined, addRandomSuffix: true })).url;
    } catch (e) {
      console.error("[documents] blob upload failed", (e as Error).message);
    }
  }

  const ex = await extract(buf, kind, file.type);
  if (ex.transactions.length) {
    const times = ex.transactions.map((t) => new Date(`${t.date}T12:00:00Z`).getTime());
    const existing = await db.transactions.find(
      { deletedAt: { $exists: false }, date: { $gte: new Date(Math.min(...times) - 3 * 86400000), $lte: new Date(Math.max(...times) + 3 * 86400000) } },
      { projection: { _id: 1, date: 1, amountCents: 1 }, limit: 5000 },
    );
    ex.transactions = markDuplicates(ex.transactions, existing);
  }
  const found = ex.transactions.length + ex.bills.length + ex.claims.length;
  await db.documents.updateOne(
    { _id: doc._id },
    { $set: { status: found ? "parsed" : "failed", extracted: ex, ...(blobUrl ? { blobUrl } : {}), ...(found ? {} : { error: ex.warnings[0] ?? "Nothing to import was found." }) } },
  );
  return { id: doc._id, status: found ? "parsed" : "failed", found };
}

export interface ImportPick {
  transactions: number[];
  bills: number[];
  claims: number[];
  accountId?: string;
}

/** Builds create ops for the picked records. Imported transactions are `source: "import"` and remember the document. */
export async function planImport(userId: string, documentId: string, pick: ImportPick, currency: string) {
  const db = repos(userId);
  const doc = await db.documents.byId(documentId);
  if (!doc) throw new HttpError(404, "Document not found");
  if (doc.status === "imported" && doc.changeSetId) {
    const cs = await db.changeSets.byId(doc.changeSetId);
    if (cs?.status === "applied") throw new HttpError(409, "Already imported. Undo the import first to import again.");
  } else if (doc.status !== "parsed") throw new HttpError(409, "Nothing to import from this document");
  if (pick.accountId && !(await db.accounts.byId(pick.accountId))) throw new HttpError(400, "Unknown account");
  const ex = doc.extracted as Extracted;
  const at = (s: string) => new Date(`${s}T12:00:00Z`);
  const ops: ChangeOp[] = [];
  for (const i of pick.transactions) {
    const t = ex.transactions[i];
    if (t) ops.push(createOp("transactions", newId(), { source: "import", date: at(t.date), amountCents: t.amountCents, currency, name: t.description, accountId: pick.accountId ?? null, tagIds: [], pending: false, documentId }));
  }
  for (const i of pick.bills) {
    const b = ex.bills[i];
    if (b) ops.push(createOp("bills", newId(), { name: b.name, amountCents: b.amountCents ?? null, dueDate: at(b.dueDate), source: "manual", status: "upcoming", recurrence: "none" }));
  }
  for (const i of pick.claims) {
    const c = ex.claims[i];
    if (c) {
      ops.push(createOp("claims", newId(), {
        title: c.title, kind: c.kind, counterparty: c.counterparty ?? null, status: c.submittedAt ? "submitted" : "draft", claimedCents: c.claimedCents ?? null,
        submittedAt: c.submittedAt ? at(c.submittedAt) : null, transactionIds: [], documentIds: [documentId], timeline: [{ at: new Date(), note: `Imported from ${doc.fileName}` }],
      }));
    }
  }
  if (!ops.length) throw new HttpError(400, "Pick at least one item to import");
  return { doc, ops };
}
