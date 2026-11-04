"use client";

import { accountLabel } from "@/lib/accounts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2, Trash2 } from "lucide-react";
import { deleteDocument, importDocument } from "@/app/actions/documents";
import { runAction } from "@/components/changes/run-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Extracted } from "@/lib/documents/extract";
import { money, shortDate } from "@/lib/format";

const select = "border-input bg-background h-9 rounded-md border px-2 text-sm";

export function DeleteDocumentButton({ id, name, after }: { id: string; name: string; after?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon-sm" variant="ghost" aria-label={`Delete ${name}`} disabled={pending}
      onClick={() => confirm(`Delete ${name}? Imported records stay.`) && start(async () => {
        const r = await deleteDocument(id);
        if (!r.ok) return void toast.error(r.error);
        toast.success("Deleted");
        if (after) router.push(after);
      })}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}

type Sel = { transactions: Set<number>; bills: Set<number>; claims: Set<number> };

export function DocumentReview({ id, ex, canImport, accounts, currency, hasFile }: {
  id: string; ex: Extracted; canImport: boolean; accounts: { _id: string; name: string; nickname?: string; mask?: string }[]; currency: string; hasFile: boolean;
}) {
  const [sel, setSel] = useState<Sel>(() => ({
    transactions: new Set(ex.transactions.flatMap((t, i) => (t.duplicateOf ? [] : [i]))),
    bills: new Set(ex.bills.map((_, i) => i)),
    claims: new Set(ex.claims.map((_, i) => i)),
  }));
  const [accountId, setAccountId] = useState("");
  const [pending, start] = useTransition();
  const toggle = (k: keyof Sel, i: number) => setSel((s) => {
    const n = new Set(s[k]);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return { ...s, [k]: n };
  });
  const total = sel.transactions.size + sel.bills.size + sel.claims.size;
  const dupes = ex.transactions.filter((t) => t.duplicateOf).length;
  const doImport = () => start(async () => {
    await runAction(importDocument(id, { transactions: [...sel.transactions], bills: [...sel.bills], claims: [...sel.claims], accountId: accountId || undefined }), `Imported ${total} item${total === 1 ? "" : "s"}`);
  });
  const Box = ({ k, i }: { k: keyof Sel; i: number }) => (
    <input type="checkbox" className="size-4 shrink-0 accent-current" checked={sel[k].has(i)} disabled={!canImport} onChange={() => toggle(k, i)} aria-label="Include" />
  );

  return (
    <div className="space-y-4">
      {(ex.summary || ex.warnings.length > 0) && (
        <Card><CardContent className="space-y-1 text-sm">
          {ex.summary && <p>{ex.summary}</p>}
          {ex.warnings.map((w) => <p key={w} className="text-muted-foreground">{w}</p>)}
        </CardContent></Card>
      )}

      {ex.transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transactions ({ex.transactions.length})</CardTitle>
            <CardDescription>{dupes ? `${dupes} look like transactions you already have and are unticked.` : "None of these match existing transactions."} Positive = money out.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canImport && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="acct" className="text-muted-foreground">Account</label>
                <select id="acct" className={select} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">None (manual)</option>
                  {accounts.map((a) => <option key={a._id} value={a._id}>{accountLabel(a)}</option>)}
                </select>
                <Button size="sm" variant="ghost" onClick={() => setSel((s) => ({ ...s, transactions: s.transactions.size ? new Set() : new Set(ex.transactions.map((_, i) => i)) }))}>
                  {sel.transactions.size ? "Untick all" : "Tick all"}
                </Button>
              </div>
            )}
            <ul className="max-h-[28rem] divide-y overflow-y-auto">
              {ex.transactions.map((t, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <Box k="transactions" i={i} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{t.description}</p>
                    <p className="text-muted-foreground text-xs">{shortDate(t.date)}{t.duplicateOf && <Badge variant="outline" className="ml-2 h-4 px-1 text-[10px]">possible duplicate</Badge>}</p>
                  </div>
                  <span className={`tabular shrink-0 ${t.amountCents < 0 ? "text-success" : ""}`}>{money(t.amountCents, currency, { sign: true })}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {ex.bills.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Bills ({ex.bills.length})</CardTitle></CardHeader>
          <CardContent><ul className="divide-y">
            {ex.bills.map((b, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <Box k="bills" i={i} />
                <div className="min-w-0 flex-1"><p className="truncate">{b.name}</p><p className="text-muted-foreground text-xs">Due {shortDate(b.dueDate)}</p></div>
                <span className="tabular">{money(b.amountCents, currency)}</span>
              </li>
            ))}
          </ul></CardContent>
        </Card>
      )}

      {ex.claims.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Claims ({ex.claims.length})</CardTitle></CardHeader>
          <CardContent><ul className="divide-y">
            {ex.claims.map((c, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <Box k="claims" i={i} />
                <div className="min-w-0 flex-1"><p className="truncate">{c.title}</p><p className="text-muted-foreground text-xs capitalize">{c.kind}{c.counterparty ? ` · ${c.counterparty}` : ""}</p></div>
                <span className="tabular">{money(c.claimedCents, currency)}</span>
              </li>
            ))}
          </ul></CardContent>
        </Card>
      )}

      <div className="bg-background/95 sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t py-3">
        {hasFile && <Button asChild variant="ghost" size="sm"><a href={`/api/documents/${id}/file`}><Download /> Original</a></Button>}
        {canImport ? (
          <Button onClick={doImport} disabled={pending || !total}>{pending && <Loader2 className="animate-spin" />}Import {total} item{total === 1 ? "" : "s"}</Button>
        ) : (
          <p className="text-muted-foreground text-sm">Imported. Undo it from the toast or Settings → History to import again.</p>
        )}
      </div>
    </div>
  );
}
