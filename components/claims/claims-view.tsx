"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { createClaim, deleteClaim, updateClaim } from "@/app/actions/edits";
import { runAction } from "@/components/changes/run-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { money, shortDate } from "@/lib/format";

export interface ClaimRow {
  _id: string;
  title: string;
  kind: "insurance" | "reimbursement" | "refund" | "warranty" | "other";
  counterparty?: string;
  status: "draft" | "submitted" | "in_review" | "approved" | "paid" | "denied" | "closed";
  claimedCents?: number;
  approvedCents?: number;
  paidCents?: number;
  deadlineAt?: string;
  notes?: string;
  timeline: { at: string; note: string }[];
  documentIds: string[];
}

const STATUSES = ["draft", "submitted", "in_review", "approved", "paid", "denied", "closed"] as const;
const KINDS = ["insurance", "reimbursement", "refund", "warranty", "other"] as const;
const OPEN = new Set(["draft", "submitted", "in_review", "approved"]);
const label = (s: string) => (s === "in_review" ? "In review" : s[0].toUpperCase() + s.slice(1));
const select = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";
const toCents = (s: string) => (s.trim() ? Math.round(parseFloat(s) * 100) : null);
const fromCents = (c?: number) => (c === undefined || c === null ? "" : (c / 100).toFixed(2));

export function ClaimsView({ claims, currency }: { claims: ClaimRow[]; currency: string }) {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = claims.filter((c) => filter === "all" || OPEN.has(c.status));
  const open = claims.find((c) => c._id === openId);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="bg-muted inline-flex rounded-lg p-0.5">
          {(["open", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
          ))}
        </div>
        <NewClaim />
      </div>
      <Card>
        <CardContent>
          {!rows.length && <p className="text-muted-foreground text-sm">{filter === "open" ? "No open claims." : "No claims yet."} Add one, or import a claim letter from Documents.</p>}
          <ul className="divide-y">
            {rows.map((c) => (
              <li key={c._id}>
                <button className="flex w-full items-center gap-3 py-3 text-left" onClick={() => setOpenId(c._id)}>
                  <ShieldCheck className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-muted-foreground text-xs capitalize">{c.kind}{c.counterparty ? ` · ${c.counterparty}` : ""}{c.deadlineAt ? ` · due ${shortDate(c.deadlineAt)}` : ""}</p>
                  </div>
                  <span className="tabular text-sm">{money(c.paidCents ?? c.approvedCents ?? c.claimedCents, currency)}</span>
                  <Badge variant={c.status === "denied" ? "destructive" : OPEN.has(c.status) ? "default" : "secondary"}>{label(c.status)}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="overflow-y-auto">{open && <ClaimEditor key={`${open._id}-${open.timeline.length}-${open.status}`} c={open} currency={currency} onDone={() => setOpenId(null)} />}</SheetContent>
      </Sheet>
    </div>
  );
}

function ClaimEditor({ c, currency, onDone }: { c: ClaimRow; currency: string; onDone: () => void }) {
  const [status, setStatus] = useState(c.status);
  const [approved, setApproved] = useState(fromCents(c.approvedCents));
  const [paid, setPaid] = useState(fromCents(c.paidCents));
  const [notes, setNotes] = useState(c.notes ?? "");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await runAction(updateClaim(c._id, { status, approvedCents: toCents(approved), paidCents: toCents(paid), notes: notes || null }, note || undefined), "Claim updated");
    if (r.ok) onDone();
  });
  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6">{c.title}</SheetTitle>
        <SheetDescription className="capitalize">{c.kind}{c.counterparty ? ` · ${c.counterparty}` : ""} · claimed {money(c.claimedCents, currency)}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor="cl-status">Status</Label>
          <select id="cl-status" className={select} value={status} onChange={(e) => setStatus(e.target.value as ClaimRow["status"])}>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5"><Label htmlFor="cl-appr">Approved</Label><Input id="cl-appr" inputMode="decimal" value={approved} onChange={(e) => setApproved(e.target.value)} placeholder="0.00" /></div>
          <div className="grid gap-1.5"><Label htmlFor="cl-paid">Paid</Label><Input id="cl-paid" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0.00" /></div>
        </div>
        <div className="grid gap-1.5"><Label htmlFor="cl-note">Add to timeline</Label><Input id="cl-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Called, reference #1234" /></div>
        <div className="grid gap-1.5"><Label htmlFor="cl-notes">Notes</Label><Textarea id="cl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="min-h-20" /></div>
        <div>
          <p className="mb-2 text-sm font-medium">Timeline</p>
          <ol className="border-muted space-y-2 border-l pl-3 text-sm">
            {[...c.timeline].reverse().map((t, i) => (
              <li key={i}><p>{t.note}</p><p className="text-muted-foreground text-xs">{shortDate(t.at)}</p></li>
            ))}
          </ol>
          {c.documentIds.length > 0 && <a href={`/documents/${c.documentIds[0]}`} className="text-muted-foreground mt-2 block text-xs underline">Source document</a>}
        </div>
      </div>
      <SheetFooter className="flex-row justify-between">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await runAction(deleteClaim(c._id), "Claim deleted"); if (r.ok) onDone(); })}><Trash2 /> Delete</Button>
        <Button onClick={save} disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>
      </SheetFooter>
    </>
  );
}

function NewClaim() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ClaimRow["kind"]>("insurance");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const r = await runAction(createClaim({ title, kind, counterparty: counterparty || null, status: submitted ? "submitted" : "draft", claimedCents: toCents(amount), deadlineAt: deadline || null }), `Added ${title}`);
    if (r.ok) {
      setOpen(false);
      setTitle("");
      setAmount("");
      setCounterparty("");
    }
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus /> New claim</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New claim</DialogTitle></DialogHeader>
        <form id="claim-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (title.trim()) submit(); }}>
          <div className="grid gap-1.5"><Label htmlFor="c-title">What for</Label><Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Urgent care visit" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="c-kind">Type</Label>
              <select id="c-kind" className={select} value={kind} onChange={(e) => setKind(e.target.value as ClaimRow["kind"])}>
                {KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="c-amt">Amount</Label><Input id="c-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="c-cp">With</Label><Input id="c-cp" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} maxLength={80} placeholder="Insurer, employer or store" /></div>
          <div className="grid gap-1.5"><Label htmlFor="c-dl">Deadline (optional)</Label><Input id="c-dl" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={submitted} onChange={(e) => setSubmitted(e.target.checked)} /> Already submitted</label>
        </form>
        <DialogFooter><Button type="submit" form="claim-form" disabled={pending || !title.trim()}>{pending && <Loader2 className="animate-spin" />}Add claim</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
