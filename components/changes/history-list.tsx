"use client";

import { useTransition } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { undoChange } from "@/app/actions/edits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relative } from "@/lib/format";
import { runAction } from "./run-action";

export interface HistoryRow {
  _id: string;
  summary: string;
  origin: string;
  status: string;
  createdAt: string;
  opCount: number;
}

const ORIGIN: Record<string, string> = { user: "You", chat: "Chat", autotag: "Auto-tag", import: "Import" };

export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">No changes yet. Edits to transactions, tags and rules show up here.</p>;
  return (
    <ul className="divide-y">
      {rows.map((r) => <Item key={`${r._id}-${r.status}`} r={r} />)}
    </ul>
  );
}

function Item({ r }: { r: HistoryRow }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{r.summary}</p>
        <p className="text-muted-foreground text-xs">
          {ORIGIN[r.origin] ?? r.origin} · {relative(r.createdAt)} · {r.opCount} change{r.opCount === 1 ? "" : "s"}
        </p>
      </div>
      {r.status === "applied" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => void (await runAction(undoChange(r._id), "Undone")))}>
          {pending ? <Loader2 className="animate-spin" /> : <Undo2 />}Undo
        </Button>
      ) : (
        <Badge variant="secondary" className="capitalize">{r.status}</Badge>
      )}
    </li>
  );
}
