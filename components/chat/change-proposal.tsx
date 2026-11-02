"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { applyChange, changeStatus, rejectChange, undoChange, type ActionResult } from "@/app/actions/edits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ProposalOutput {
  changeSetId?: string;
  summary?: string;
  counts?: { transactions: number; newTags: number; rules: number };
  newTags?: string[];
  rules?: string[];
  preview?: { date: string | null; description: string; amount: number | null; changes: string[] }[];
  /** Auto-tag previews group by tag instead of listing transactions. */
  groups?: { tag: string; isNew: boolean; count: number; confidence: number; examples: string[] }[];
  error?: string;
}

type Status = "proposed" | "applied" | "rejected" | "reverted";
const usd = (n: number | null) => (n === null ? "" : `${n < 0 ? "+" : ""}${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD" })}`);

/** Diff card for a proposeChanges result: Apply / Discard, then Undo. Status is read live so reloaded chats stay correct. */
export function ChangeProposal({ out, onSettled }: { out: ProposalOutput; onSettled?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, start] = useTransition();
  const id = out.changeSetId;

  useEffect(() => {
    if (!id) return;
    let live = true;
    changeStatus(id).then((s) => live && setStatus((s as Status | null) ?? "rejected")).catch(() => live && setStatus("proposed"));
    return () => { live = false; };
  }, [id]);

  if (out.error || !id) return <p className="text-muted-foreground my-2 text-xs">Couldn&apos;t prepare that change: {out.error}</p>;

  const act = (fn: (id: string, refreshPage: boolean) => Promise<ActionResult>, next: Status, msg: string) =>
    start(async () => {
      const r = await fn(id, false);
      if (!r.ok) return void toast.error(r.error);
      setStatus(next);
      toast.success(msg);
      onSettled?.();
    });

  const c = out.counts;
  return (
    <div className="bg-card my-2 overflow-hidden rounded-xl border">
      <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{out.summary}</p>
          <p className="text-muted-foreground text-xs">
            {[c?.transactions ? `${c.transactions} transaction${c.transactions === 1 ? "" : "s"}` : null, c?.newTags ? `${c.newTags} new tag${c.newTags === 1 ? "" : "s"}` : null, c?.rules ? `${c.rules} rule${c.rules === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {status && status !== "proposed" && <Badge variant={status === "applied" ? "default" : "secondary"} className="shrink-0 capitalize">{status === "reverted" ? "Undone" : status === "rejected" ? "Discarded" : "Applied"}</Badge>}
      </div>
      {(out.newTags?.length || out.rules?.length) ? (
        <div className="space-y-0.5 border-b px-3 py-2 text-xs">
          {out.newTags?.map((t) => <p key={t}>New tag <span className="font-medium">{t}</span></p>)}
          {out.rules?.map((r) => <p key={r}>New rule: {r}</p>)}
        </div>
      ) : null}
      {out.groups?.length ? (
        <div className="max-h-72 divide-y overflow-y-auto">
          {out.groups.map((g) => (
            <div key={g.tag} className="px-3 py-2 text-xs">
              <p className="flex items-center gap-2">
                <span className="font-medium">{g.tag}</span>
                {g.isNew && <Badge variant="outline" className="h-4 px-1 text-[10px]">new</Badge>}
                <span className="text-muted-foreground ml-auto">{g.count} · {Math.round(g.confidence * 100)}% sure</span>
              </p>
              <p className="text-muted-foreground truncate">{g.examples.join(", ")}</p>
            </div>
          ))}
        </div>
      ) : null}
      {out.preview?.length ? (
        <div className="max-h-60 divide-y overflow-y-auto">
          {out.preview.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.description}</span>
                <span className="text-muted-foreground">{p.date} {usd(p.amount)}</span>
              </span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {p.changes.map((ch) => (
                  <span key={ch} className={ch.startsWith("−") ? "text-destructive" : ch.startsWith("+") ? "text-success" : "text-muted-foreground max-w-40 truncate"}>{ch}</span>
                ))}
              </span>
            </div>
          ))}
          {c && c.transactions > out.preview.length && <p className="text-muted-foreground px-3 py-1.5 text-xs">and {c.transactions - out.preview.length} more</p>}
        </div>
      ) : null}
      <div className="bg-muted/40 flex justify-end gap-2 px-3 py-2">
        {pending && <Loader2 className="text-muted-foreground size-4 animate-spin self-center" />}
        {status === "proposed" && (
          <>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(rejectChange, "rejected", "Discarded")}><X />Discard</Button>
            <Button size="sm" disabled={pending} onClick={() => act(applyChange, "applied", "Applied")}><Check />Apply</Button>
          </>
        )}
        {status === "applied" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act(undoChange, "reverted", "Undone")}><Undo2 />Undo</Button>
        )}
        {status === null && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
      </div>
    </div>
  );
}
