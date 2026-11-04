"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AccountMultiSelect, type AccountOption } from "@/components/accounts/account-multi-select";
import { Input } from "@/components/ui/input";

const DELAY = 400;

/** Search, accounts and tag filters. Applied automatically shortly after any change (no Filter button). */
export function TransactionFilters({ q, accountIds, tagId, accounts, tags }: {
  q?: string; accountIds: string[]; tagId?: string; accounts: AccountOption[]; tags: { _id: string; name: string }[];
}) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [text, setText] = useState(q ?? "");
  const [acc, setAcc] = useState(accountIds);
  const [tag, setTag] = useState(tagId ?? "");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (text.trim()) sp.set("q", text.trim());
      for (const id of acc) sp.append("account", id);
      if (tag) sp.set("tag", tag);
      const qs = sp.toString();
      start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
    }, DELAY);
    return () => clearTimeout(t);
  }, [text, acc, tag, path, router]);

  return (
    <div className="mb-4 grid grid-cols-2 items-center gap-2 sm:flex" role="search">
      <div className="relative col-span-2 sm:w-full sm:max-w-sm">
        <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, merchant, notes…" aria-label="Search transactions" />
        {pending && <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" aria-label="Updating" />}
      </div>
      <AccountMultiSelect accounts={accounts} value={acc} onChange={setAcc} />
      <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag" className="border-input bg-background h-10 min-w-0 rounded-md border px-3 text-sm sm:h-9">
        <option value="">All tags</option>
        <option value="none">Untagged</option>
        {tags.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
      </select>
    </div>
  );
}
