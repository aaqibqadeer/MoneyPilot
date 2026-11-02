"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Uploads one file to /api/documents; parsing happens server-side, then we open the review screen. */
export async function uploadFile(file: File): Promise<{ id: string; status: string; found: number }> {
  const body = new FormData();
  body.append("file", file);
  const r = await fetch("/api/documents", { method: "POST", body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Upload failed");
  return j;
}

export function Uploader({ accept }: { accept: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const send = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadFile(file);
      if (r.status === "failed") toast.error("Nothing to import was found in that file.");
      router.push(`/documents/${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files[0]); }}
      className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center sm:p-10", over && "border-primary bg-primary/5")}
    >
      <Upload className="text-muted-foreground size-6" />
      <div>
        <p className="text-sm font-medium">Drop a statement, receipt, bill or claim letter</p>
        <p className="text-muted-foreground text-xs">CSV, XLSX, PDF, TXT or a photo · up to 10 MB · you review everything before it&apos;s imported</p>
      </div>
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => send(e.target.files?.[0])} />
      <Button onClick={() => input.current?.click()} disabled={busy}>{busy ? <><Loader2 className="animate-spin" /> Reading…</> : "Choose file"}</Button>
    </div>
  );
}
