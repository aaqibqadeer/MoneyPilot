import Link from "next/link";
import { FileText } from "lucide-react";
import { Uploader } from "@/components/documents/uploader";
import { DeleteDocumentButton } from "@/components/documents/review";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { ACCEPT } from "@/lib/documents/extract";
import { features } from "@/lib/env";
import { relative } from "@/lib/format";
import { listDocuments } from "@/lib/queries";

export const metadata = { title: "Documents" };

const STATUS: Record<string, "default" | "secondary" | "destructive" | "outline"> = { parsed: "default", imported: "secondary", failed: "destructive", parsing: "outline", uploaded: "outline" };

export default async function DocumentsPage() {
  const user = await requireUser();
  const docs = await listDocuments(user._id);
  return (
    <>
      <PageHeader title="Documents" description="Import transactions, bills and claims from files. Every import can be undone." />
      <div className="space-y-4">
        <Uploader accept={ACCEPT} />
        <p className="text-muted-foreground text-xs">
          {features.blob ? "Originals are kept in private storage." : "File storage isn't configured (BLOB_READ_WRITE_TOKEN), so originals aren't kept; parsing still works."}{" "}
          {!features.llm && "PDFs and text need DEEPSEEK_API_KEY. "}
          {!features.vision && "Photos and scanned PDFs need LLM_VISION_MODEL."}
        </p>
        <Card>
          <CardHeader><CardTitle className="text-base">Your documents</CardTitle></CardHeader>
          <CardContent>
            {!docs.length && <p className="text-muted-foreground text-sm">Nothing uploaded yet.</p>}
            <ul className="divide-y">
              {docs.map((d) => (
                <li key={d._id} className="flex items-center gap-3 py-3">
                  <FileText className="text-muted-foreground size-4 shrink-0" />
                  <Link href={`/documents/${d._id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.fileName}</p>
                    <p className="text-muted-foreground text-xs">{relative(d.createdAt)} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB</p>
                  </Link>
                  <Badge variant={STATUS[d.status] ?? "outline"} className="capitalize">{d.status === "parsed" ? "Ready to review" : d.status}</Badge>
                  <DeleteDocumentButton id={d._id} name={d.fileName} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
