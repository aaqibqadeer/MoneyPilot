"use client";

import { useState, useTransition } from "react";
import { Loader2, Tags, X } from "lucide-react";
import { bulkTag, createRule, saveTransaction } from "@/app/actions/edits";
import { toast } from "sonner";
import { runAction } from "@/components/changes/run-action";
import { TagChip, TagPicker, type TagLite } from "@/components/tags/tag-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { categoryLabel, money, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TxnRowData {
  _id: string;
  date: string;
  name: string;
  merchant?: string;
  description?: string;
  notes?: string;
  amountCents: number;
  currency: string;
  account: string;
  category?: string;
  categoryDetailed?: string;
  tagIds: string[];
  pending: boolean;
  source: string;
}

/** Transactions list with selection, bulk tagging and an edit drawer. */
export function TransactionsTable({ rows, tags }: { rows: TxnRowData[]; tags: TagLite[] }) {
  const [picked, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  // derived from rows so the drawer and selection stay in sync after the page refreshes
  const open = rows.find((r) => r._id === openId) ?? null;
  const selected = picked.filter((id) => rows.some((r) => r._id === id));
  const [bulkOpen, setBulkOpen] = useState(false);
  const tagMap = new Map(tags.map((t) => [t._id, t]));
  const allOn = selected.length === rows.length && rows.length > 0;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      {selected.length > 0 && (
        <div className="bg-card sticky top-2 z-10 mb-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-sm">
          <span className="text-sm">{selected.length} selected</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setBulkOpen(true)}><Tags className="size-4" />Tag</Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Clear selection" onClick={() => setSelected([])}><X className="size-4" /></Button>
          </div>
        </div>
      )}
      <Card className="gap-0 divide-y py-0">
        <label className="text-muted-foreground flex items-center gap-3 px-4 py-2 text-xs">
          <input type="checkbox" className="accent-primary size-4" checked={allOn} onChange={() => setSelected(allOn ? [] : rows.map((r) => r._id))} aria-label="Select all" />
          Select all on this page
        </label>
        {rows.map((t) => (
          <div key={t._id} className={cn("hover:bg-muted/40 flex items-center gap-3 px-4 py-3", selected.includes(t._id) && "bg-muted/60")}>
            <input type="checkbox" className="accent-primary size-4 shrink-0" checked={selected.includes(t._id)} onChange={() => toggle(t._id)} aria-label={`Select ${t.description ?? t.merchant ?? t.name}`} />
            <button type="button" onClick={() => setOpenId(t._id)} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t.description ?? t.merchant ?? t.name}</span>
                <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span>{shortDate(t.date)}</span>
                  <span className="hidden sm:inline">· {t.account}</span>
                  <span className="hidden md:inline">· {categoryLabel(t.category)}</span>
                  {t.pending && <Badge variant="outline" className="h-4 px-1 text-[10px]">Pending</Badge>}
                  {t.notes && <span className="hidden max-w-48 truncate italic lg:inline">“{t.notes}”</span>}
                  {t.tagIds.map((id) => (tagMap.get(id) ? <TagChip key={id} tag={tagMap.get(id)!} /> : null))}
                </span>
              </span>
              <span className={cn("tabular shrink-0 text-sm", t.amountCents < 0 && "text-success")}>{money(t.amountCents, t.currency, { sign: true })}</span>
            </button>
          </div>
        ))}
      </Card>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="overflow-y-auto">{open && <TxnEditor key={`${open._id}-${open.tagIds.join()}-${open.description}-${open.notes}`} t={open} tags={tags} onDone={() => setOpenId(null)} />}</SheetContent>
      </Sheet>
      <Sheet open={bulkOpen} onOpenChange={setBulkOpen}>
        <SheetContent>{bulkOpen && <BulkTagger ids={selected} rows={rows} tags={tags} onDone={() => { setBulkOpen(false); setSelected([]); }} />}</SheetContent>
      </Sheet>
    </>
  );
}

function TxnEditor({ t, tags, onDone }: { t: TxnRowData; tags: TagLite[]; onDone: () => void }) {
  const [description, setDescription] = useState(t.description ?? "");
  const [notes, setNotes] = useState(t.notes ?? "");
  const [tagIds, setTagIds] = useState(t.tagIds);
  const [pending, start] = useTransition();
  const dirty = description !== (t.description ?? "") || notes !== (t.notes ?? "") || tagIds.join() !== t.tagIds.join();

  const save = () =>
    start(async () => {
      const r = await runAction(saveTransaction(t._id, { description: description || null, notes: notes || null, tagIds }), "Transaction saved");
      if (!r.ok) return;
      onDone();
      // Correction → offer a rule so it sticks next time (CLAUDE.md §9).
      const added = tagIds.filter((id) => !t.tagIds.includes(id));
      const who = t.merchant ?? t.name;
      if (added.length && who) {
        const names = added.map((id) => tags.find((x) => x._id === id)?.name).filter(Boolean).join(", ");
        toast(`Always tag ${who} as ${names}?`, {
          duration: 10000,
          action: {
            label: "Create rule",
            onClick: () => void runAction(createRule({ field: t.merchant ? "merchant" : "name", match: t.merchant ? "equals" : "contains", pattern: who, tagIds: added }, true), `Rule added for ${who}`),
          },
        });
      }
    });

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6">{t.description ?? t.merchant ?? t.name}</SheetTitle>
        <SheetDescription>
          {shortDate(t.date)} · {t.account}{t.pending ? " · pending" : ""}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4">
        <p className={cn("tabular text-2xl font-semibold", t.amountCents < 0 && "text-success")}>{money(t.amountCents, t.currency, { sign: true })}</p>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <dt className="text-muted-foreground">Bank name</dt><dd className="col-span-2 break-words">{t.name}</dd>
          <dt className="text-muted-foreground">Merchant</dt><dd className="col-span-2">{t.merchant ?? "—"}</dd>
          <dt className="text-muted-foreground">Category</dt><dd className="col-span-2">{categoryLabel(t.category)}</dd>
          <dt className="text-muted-foreground">Source</dt><dd className="col-span-2 capitalize">{t.source}</dd>
        </dl>
        <div className="space-y-1.5">
          <Label htmlFor="desc">Description</Label>
          <Input id="desc" value={description} maxLength={500} placeholder={t.merchant ?? t.name} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className="min-h-20" />
        </div>
        <div className="space-y-1.5">
          <Label>Tags</Label>
          <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />
        </div>
      </div>
      <SheetFooter>
        <Button onClick={save} disabled={!dirty || pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>
      </SheetFooter>
    </>
  );
}

function BulkTagger({ ids, rows, tags, onDone }: { ids: string[]; rows: TxnRowData[]; tags: TagLite[]; onDone: () => void }) {
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const present = tags.filter((t) => rows.some((r) => ids.includes(r._id) && r.tagIds.includes(t._id)));

  const save = () =>
    start(async () => {
      const r = await runAction(bulkTag(ids, add, remove), `Updated tags on ${ids.length} transaction${ids.length === 1 ? "" : "s"}`);
      if (r.ok) onDone();
    });

  return (
    <>
      <SheetHeader>
        <SheetTitle>Tag {ids.length} transaction{ids.length === 1 ? "" : "s"}</SheetTitle>
        <SheetDescription>You can undo this from the toast or Settings → History.</SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4">
        <div className="space-y-1.5">
          <Label>Add tags</Label>
          <TagPicker tags={tags} value={add} onChange={setAdd} />
        </div>
        {present.length > 0 && (
          <div className="space-y-1.5">
            <Label>Remove tags</Label>
            <TagPicker tags={present} value={remove} onChange={setRemove} />
          </div>
        )}
      </div>
      <SheetFooter>
        <Button onClick={save} disabled={pending || (!add.length && !remove.length)}>{pending && <Loader2 className="animate-spin" />}Apply</Button>
      </SheetFooter>
    </>
  );
}
