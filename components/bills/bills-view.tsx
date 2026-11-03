"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, List, Loader2, Plus, Repeat, Trash2 } from "lucide-react";
import { createBill, deleteBill, markBillPaid } from "@/app/actions/edits";
import { CancelDialog } from "@/components/assist/assist-dialog";
import { runAction } from "@/components/changes/run-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BillRow {
  _id: string;
  name: string;
  amountCents?: number;
  dueDate: string;
  source: "liability" | "manual" | "recurring";
  status: "upcoming" | "paid" | "overdue";
  recurrence: "none" | "weekly" | "monthly" | "yearly";
  accountId?: string;
  account?: string;
}
export interface RecurringRow {
  key: string;
  name: string;
  recurrence: "weekly" | "monthly" | "yearly";
  amountCents: number;
  count: number;
  nextDate: string;
  accountId?: string;
  account?: string;
}

const select = "border-input bg-background h-9 rounded-md border px-2 text-sm";
const SOURCE: Record<BillRow["source"], string> = { liability: "Card", manual: "Manual", recurring: "Recurring" };
const today = () => new Date(new Date().toISOString().slice(0, 10));
/** Paid wins; otherwise anything due before today is overdue. */
const statusOf = (b: BillRow) => (b.status === "paid" ? "paid" : new Date(b.dueDate) < today() ? "overdue" : "upcoming");

export function BillsView({ bills, recurring, currency, userName }: { bills: BillRow[]; recurring: RecurringRow[]; currency: string; userName?: string }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="bg-muted inline-flex rounded-lg p-0.5">
          {(["list", "calendar"] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} onClick={() => setView(v)} className="capitalize">
              {v === "list" ? <List /> : <CalendarDays />} {v}
            </Button>
          ))}
        </div>
        <BillDialog />
      </div>
      {view === "list" ? <BillList bills={bills} currency={currency} userName={userName} /> : <BillCalendar bills={bills} currency={currency} />}
      <Recurring rows={recurring} currency={currency} userName={userName} />
    </div>
  );
}

function BillList({ bills, currency, userName }: { bills: BillRow[]; currency: string; userName?: string }) {
  const groups = (["overdue", "upcoming", "paid"] as const).map((s) => ({ s, rows: bills.filter((b) => statusOf(b) === s) }));
  if (!bills.length) return <Card><CardContent className="text-muted-foreground text-sm">No bills yet. Add one, or track a recurring charge below.</CardContent></Card>;
  return (
    <>
      {groups.filter((g) => g.rows.length).map(({ s, rows }) => (
        <Card key={s}>
          <CardHeader><CardTitle className="text-base capitalize">{s} <span className="text-muted-foreground font-normal">· {money(rows.reduce((t, b) => t + (b.amountCents ?? 0), 0), currency)}</span></CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">{(s === "paid" ? [...rows].reverse() : rows).map((b) => <BillItem key={`${b._id}-${b.status}`} b={b} currency={currency} userName={userName} />)}</ul>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function BillItem({ b, currency, userName }: { b: BillRow; currency: string; userName?: string }) {
  const [pending, start] = useTransition();
  const st = statusOf(b);
  return (
    <li className="flex items-center gap-2 py-3 sm:gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{b.name}</p>
          <span className="tabular shrink-0 text-sm sm:hidden">{money(b.amountCents, currency)}</span>
        </div>
        <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cn(st === "overdue" && "text-destructive")}>{shortDate(b.dueDate)}</span>
          <span>· {SOURCE[b.source]}</span>
          {b.account && <span>· {b.account}</span>}
          {b.recurrence !== "none" && <span className="inline-flex items-center gap-0.5">· <Repeat className="size-3" /> {b.recurrence}</span>}
        </p>
      </div>
      <span className="tabular shrink-0 text-sm max-sm:hidden">{money(b.amountCents, currency)}</span>
      {st !== "paid" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => void (await runAction(markBillPaid(b._id), `Marked ${b.name} paid`)))}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}<span className="sr-only sm:not-sr-only">Paid</span>
        </Button>
      ) : (
        <Badge variant="secondary">Paid</Badge>
      )}
      {b.source !== "liability" && b.recurrence !== "none" && st !== "paid" && <CancelDialog merchant={b.name} amountCents={b.amountCents} currency={currency} account={b.account} userName={userName} />}
      {b.source !== "liability" && (
        <Button size="icon-sm" variant="ghost" aria-label="Delete bill" disabled={pending} onClick={() => start(async () => void (await runAction(deleteBill(b._id), `Deleted ${b.name}`)))}>
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function BillCalendar({ bills, currency }: { bills: BillRow[]; currency: string }) {
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const byDay = new Map<number, BillRow[]>();
  for (const b of bills) {
    const d = new Date(b.dueDate);
    if (d.getUTCFullYear() === first.getUTCFullYear() && d.getUTCMonth() === first.getUTCMonth()) byDay.set(d.getUTCDate(), [...(byDay.get(d.getUTCDate()) ?? []), b]);
  }
  const cells = [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const isToday = (d: number) => offset === 0 && d === now.getUTCDate();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</CardTitle>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => setOffset(offset - 1)}><ChevronLeft /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => setOffset(offset + 1)}><ChevronRight /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground grid grid-cols-7 gap-1 text-center text-xs">{"SMTWTFS".split("").map((d, i) => <div key={i}>{d}</div>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => (
            <div key={i} className={cn("min-h-14 rounded-md border p-1 text-xs sm:min-h-20", !d && "border-transparent", d && isToday(d) && "border-primary")}>
              {d && <span className="text-muted-foreground">{d}</span>}
              {d && byDay.get(d)?.map((b) => (
                <div key={b._id} title={`${b.name} ${money(b.amountCents, currency)}`} className={cn("mt-0.5 truncate rounded px-1", statusOf(b) === "paid" ? "bg-muted text-muted-foreground line-through" : statusOf(b) === "overdue" ? "bg-destructive/15 text-destructive" : "bg-primary/15")}>
                  <span className="hidden sm:inline">{b.name}</span>
                  <span className="sm:hidden">•</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Recurring({ rows, currency, userName }: { rows: RecurringRow[]; currency: string; userName?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Detected recurring charges</CardTitle>
        <CardDescription>Merchants that charge you on a regular schedule. Track one to get it on your bills list, or Cancel to get its cancel page and a ready-to-send email.</CardDescription>
      </CardHeader>
      <CardContent>
        {!rows.length && <p className="text-muted-foreground text-sm">Nothing new detected.</p>}
        <ul className="divide-y">{rows.map((r) => <RecurringItem key={r.key} r={r} currency={currency} userName={userName} />)}</ul>
      </CardContent>
    </Card>
  );
}

function RecurringItem({ r, currency, userName }: { r: RecurringRow; currency: string; userName?: string }) {
  const [pending, start] = useTransition();
  const track = () => start(async () => void (await runAction(createBill({ name: r.name, amountCents: r.amountCents, dueDate: r.nextDate, recurrence: r.recurrence, ...(r.accountId ? { accountId: r.accountId } : {}) }, "recurring"), `Tracking ${r.name}`)));
  return (
    <li className="flex items-center gap-2 py-3 sm:gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{r.name}</p>
          <span className="tabular shrink-0 text-sm sm:hidden">{money(r.amountCents, currency)}</span>
        </div>
        <p className="text-muted-foreground text-xs first-letter:uppercase">{r.recurrence} · {r.count} charges · next ~{shortDate(r.nextDate)}{r.account && ` · ${r.account}`}</p>
      </div>
      <span className="tabular shrink-0 text-sm max-sm:hidden">{money(r.amountCents, currency)}</span>
      <CancelDialog merchant={r.name} amountCents={r.amountCents} currency={currency} account={r.account} userName={userName} />
      <Button size="sm" variant="outline" disabled={pending} onClick={track}>{pending ? <Loader2 className="animate-spin" /> : <Plus />}<span className="sr-only sm:not-sr-only">Track</span></Button>
    </li>
  );
}

function BillDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10));
  const [recurrence, setRecurrence] = useState<BillRow["recurrence"]>("monthly");
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const cents = amount ? Math.round(parseFloat(amount) * 100) : null;
    const r = await runAction(createBill({ name, amountCents: Number.isFinite(cents) ? cents : null, dueDate: due, recurrence }), `Added ${name}`);
    if (r.ok) {
      setOpen(false);
      setName("");
      setAmount("");
    }
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus /> Add bill</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a bill</DialogTitle></DialogHeader>
        <form id="bill-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) submit(); }}>
          <div className="grid gap-1.5"><Label htmlFor="bill-name">Name</Label><Input id="bill-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="bill-amount">Amount</Label><Input id="bill-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div className="grid gap-1.5"><Label htmlFor="bill-due">Due</Label><Input id="bill-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} required /></div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bill-rec">Repeats</Label>
            <select id="bill-rec" className={select} value={recurrence} onChange={(e) => setRecurrence(e.target.value as BillRow["recurrence"])}>
              {["none", "weekly", "monthly", "yearly"].map((r) => <option key={r} value={r}>{r === "none" ? "Doesn't repeat" : r[0].toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
        </form>
        <DialogFooter><Button type="submit" form="bill-form" disabled={pending || !name.trim()}>{pending && <Loader2 className="animate-spin" />}Add bill</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
