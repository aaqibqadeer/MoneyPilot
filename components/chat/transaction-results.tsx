"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface TxnRow {
  id: string;
  date: string | null;
  description: string;
  amount: number | null;
  account?: string;
  category?: string;
  tags: string[];
  pending: boolean;
  notes?: string;
}

const usd = (n: number | null) =>
  n === null ? "—" : `${n < 0 ? "+" : ""}${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD" })}`;

/** searchTransactions output as a compact table; rows open a detail drawer. */
export function TransactionResults({ total, transactions }: { total: number; transactions: TxnRow[] }) {
  const [open, setOpen] = useState<TxnRow | null>(null);
  if (!transactions.length) return null;
  return (
    <div className="my-2 overflow-hidden rounded-xl border">
      <div className="bg-muted/50 text-muted-foreground px-3 py-1.5 text-xs">
        {transactions.length} of {total} transactions
      </div>
      <div className="max-h-72 divide-y overflow-y-auto">
        {transactions.map((t) => (
          <button key={t.id} onClick={() => setOpen(t)} className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs">
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.description}</span>
              <span className="text-muted-foreground">{t.date}{t.account ? ` · ${t.account}` : ""}</span>
            </span>
            <span className={`tabular shrink-0 ${t.amount !== null && t.amount < 0 ? "text-success" : ""}`}>{usd(t.amount)}</span>
          </button>
        ))}
      </div>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent>
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.description}</SheetTitle>
                <SheetDescription>{open.date}{open.pending ? " · pending" : ""}</SheetDescription>
              </SheetHeader>
              <dl className="grid grid-cols-3 gap-3 px-4 text-sm">
                <dt className="text-muted-foreground">Amount</dt><dd className="tabular col-span-2">{usd(open.amount)}</dd>
                <dt className="text-muted-foreground">Account</dt><dd className="col-span-2">{open.account ?? "—"}</dd>
                <dt className="text-muted-foreground">Category</dt><dd className="col-span-2">{open.category ?? "—"}</dd>
                <dt className="text-muted-foreground">Tags</dt>
                <dd className="col-span-2 flex flex-wrap gap-1">{open.tags.length ? open.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>) : "—"}</dd>
                <dt className="text-muted-foreground">Notes</dt><dd className="col-span-2">{open.notes ?? "—"}</dd>
              </dl>
              <div className="px-4">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/transactions?q=${encodeURIComponent(open.description)}`}>Open in Transactions</Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
