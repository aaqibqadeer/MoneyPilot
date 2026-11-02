"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Play, Plus, Trash2 } from "lucide-react";
import { applyRule, createRule, createTag, deleteRule, deleteTag, setRuleEnabled, updateTag } from "@/app/actions/edits";
import { runAction } from "@/components/changes/run-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagChip, TagPicker, type TagLite } from "./tag-picker";

export interface TagRow extends TagLite {
  count: number;
}
export interface RuleRow {
  _id: string;
  field: "name" | "merchant" | "description";
  match: "contains" | "equals" | "regex";
  pattern: string;
  tagIds: string[];
  enabled: boolean;
}

const select = "border-input bg-background h-9 rounded-md border px-2 text-sm";

export function TagsManager({ tags, rules }: { tags: TagRow[]; rules: RuleRow[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TagList tags={tags} />
      <RuleList tags={tags} rules={rules} />
    </div>
  );
}

function TagList({ tags }: { tags: TagRow[] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const add = () =>
    start(async () => {
      const r = await runAction(createTag(name), `Created tag ${name.trim()}`);
      if (r.ok) setName("");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
        <CardDescription>Group spending your way. Tap a count to see its transactions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add(); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" maxLength={40} aria-label="New tag name" />
          <Button type="submit" disabled={pending || !name.trim()}>{pending ? <Loader2 className="animate-spin" /> : <Plus />}Add</Button>
        </form>
        {tags.length === 0 && <p className="text-muted-foreground text-sm">No tags yet.</p>}
        <ul className="divide-y">
          {tags.map((t) => <TagItem key={`${t._id}-${t.name}-${t.color}`} tag={t} />)}
        </ul>
      </CardContent>
    </Card>
  );
}

function TagItem({ tag }: { tag: TagRow }) {
  const [name, setName] = useState(tag.name);
  const [pending, start] = useTransition();
  const save = (patch: { name?: string; color?: string }) => start(async () => void (await runAction(updateTag(tag._id, patch), "Tag updated")));
  const remove = () => {
    if (!confirm(`Delete "${tag.name}"? It will be removed from ${tag.count} transactions. You can undo this.`)) return;
    start(async () => void (await runAction(deleteTag(tag._id), `Deleted ${tag.name}`)));
  };

  return (
    <li className="flex items-center gap-2 py-2">
      <input type="color" defaultValue={tag.color} aria-label={`${tag.name} color`} className="size-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        onBlur={(e) => e.target.value !== tag.color && save({ color: e.target.value })} />
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Tag name" className="h-8"
        onBlur={() => name.trim() && name.trim() !== tag.name ? save({ name: name.trim() }) : setName(tag.name)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      <Link href={`/transactions?tag=${tag._id}`} className="text-muted-foreground hover:text-foreground w-12 shrink-0 text-right text-xs tabular-nums">{tag.count}</Link>
      <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Delete ${tag.name}`} onClick={remove} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </Button>
    </li>
  );
}

function RuleList({ tags, rules }: { tags: TagRow[]; rules: RuleRow[] }) {
  const [field, setField] = useState<RuleRow["field"]>("merchant");
  const [match, setMatch] = useState<RuleRow["match"]>("contains");
  const [pattern, setPattern] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [applyNow, setApplyNow] = useState(true);
  const [pending, start] = useTransition();
  const tagMap = new Map(tags.map((t) => [t._id, t]));

  const add = () =>
    start(async () => {
      const r = await runAction(createRule({ field, match, pattern, tagIds }, applyNow), "Rule added");
      if (r.ok) {
        setPattern("");
        setTagIds([]);
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tag rules</CardTitle>
        <CardDescription>Tag matching transactions automatically. Rules never remove tags.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-3 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <div className="flex flex-wrap gap-2">
            <select className={select} value={field} onChange={(e) => setField(e.target.value as RuleRow["field"])} aria-label="Field">
              <option value="merchant">Merchant</option>
              <option value="name">Bank name</option>
              <option value="description">Description</option>
            </select>
            <select className={select} value={match} onChange={(e) => setMatch(e.target.value as RuleRow["match"])} aria-label="Match">
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="regex">matches regex</option>
            </select>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. uber" maxLength={200} className="min-w-32 flex-1" aria-label="Pattern" />
          </div>
          <div className="space-y-1.5">
            <Label>Then tag as</Label>
            <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary size-4" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} />
              Also tag existing matches
            </label>
            <Button type="submit" size="sm" disabled={pending || !pattern.trim() || !tagIds.length}>{pending ? <Loader2 className="animate-spin" /> : <Plus />}Add rule</Button>
          </div>
        </form>
        {rules.length === 0 && <p className="text-muted-foreground text-sm">No rules yet.</p>}
        <ul className="divide-y">
          {rules.map((r) => <RuleItem key={`${r._id}-${r.enabled}`} rule={r} tagMap={tagMap} />)}
        </ul>
      </CardContent>
    </Card>
  );
}

function RuleItem({ rule, tagMap }: { rule: RuleRow; tagMap: Map<string, TagRow> }) {
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<unknown>) => start(async () => void (await fn()));
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
      <span className={rule.enabled ? "" : "text-muted-foreground line-through"}>
        {rule.field === "name" ? "Bank name" : rule.field[0].toUpperCase() + rule.field.slice(1)} {rule.match === "regex" ? "matches" : rule.match} <code className="bg-muted rounded px-1">{rule.pattern}</code>
      </span>
      <span className="flex flex-wrap gap-1">{rule.tagIds.map((id) => (tagMap.get(id) ? <TagChip key={id} tag={tagMap.get(id)!} /> : null))}</span>
      <span className="ml-auto flex items-center gap-1">
        {pending && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(async () => {
          const r = await applyRule(rule._id);
          if (r.ok && !r.count) return runAction(Promise.resolve(r), "No untagged matches");
          return runAction(Promise.resolve(r), `Tagged ${r.ok ? r.count : 0} transactions`);
        })}><Play className="size-3.5" />Run</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => runAction(setRuleEnabled(rule._id, !rule.enabled), rule.enabled ? "Rule disabled" : "Rule enabled"))}>
          {rule.enabled ? "Disable" : "Enable"}
        </Button>
        <Button size="icon" variant="ghost" className="size-8" aria-label="Delete rule" disabled={pending} onClick={() => act(() => runAction(deleteRule(rule._id), "Rule deleted"))}><Trash2 className="size-4" /></Button>
      </span>
    </li>
  );
}
