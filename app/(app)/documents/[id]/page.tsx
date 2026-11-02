import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DeleteDocumentButton, DocumentReview } from "@/components/documents/review";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { repos } from "@/lib/db/repos";
import type { Extracted } from "@/lib/documents/extract";

export const metadata = { title: "Review document" };

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const db = repos(user._id);
  const doc = await db.documents.byId(id);
  if (!doc) notFound();
  const [accounts, cs] = await Promise.all([
    db.accounts.find({}, { sort: { name: 1 }, projection: { _id: 1, name: 1, mask: 1 } }),
    doc.changeSetId ? db.changeSets.byId(doc.changeSetId) : null,
  ]);
  const canImport = doc.status === "parsed" || (doc.status === "imported" && cs?.status !== "applied");
  const ex = doc.extracted as Extracted | undefined;
  return (
    <>
      <PageHeader title={doc.fileName} description={doc.status === "failed" ? "Couldn't find anything to import." : "Untick anything you don't want, then import."}>
        <Button asChild variant="ghost" size="sm"><Link href="/documents"><ArrowLeft /> Documents</Link></Button>
        <DeleteDocumentButton id={doc._id} name={doc.fileName} after="/documents" />
      </PageHeader>
      {doc.status === "failed" || !ex ? (
        <Card><CardContent className="text-sm">{doc.error ?? "This file couldn't be read."}</CardContent></Card>
      ) : (
        <DocumentReview
          id={doc._id} ex={ex} canImport={canImport} currency={user.currency} hasFile={!!doc.blobUrl}
          accounts={accounts.map((a) => ({ _id: a._id, name: a.name, mask: a.mask }))}
        />
      )}
    </>
  );
}
