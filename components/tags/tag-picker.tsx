"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TagLite {
  _id: string;
  name: string;
  color: string;
}

export function TagChip({ tag, className }: { tag: TagLite; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium", className)} style={{ color: tag.color, borderColor: `${tag.color}55`, background: `${tag.color}14` }}>
      {tag.name}
    </span>
  );
}

/** Toggleable tag chips. */
export function TagPicker({ tags, value, onChange }: { tags: TagLite[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (!tags.length) return <p className="text-muted-foreground text-xs">No tags yet. Create them on the Tags page.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => {
        const on = value.includes(t._id);
        return (
          <button
            key={t._id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== t._id) : [...value, t._id])}
            className={cn("inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors", on ? "font-medium" : "text-muted-foreground hover:bg-accent")}
            style={on ? { color: t.color, borderColor: t.color, background: `${t.color}1f` } : undefined}
          >
            {on && <Check className="size-3" />}
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
