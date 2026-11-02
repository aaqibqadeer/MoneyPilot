"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface S { id: string; title: string; pinned: boolean; lastMessageAt: string }

export const refreshSessions = () => window.dispatchEvent(new Event("chat:refresh"));

function group(s: S, now: Date) {
  if (s.pinned) return "Pinned";
  const d = new Date(s.lastMessageAt);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return "Older";
}
const ORDER = ["Pinned", "Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];

export function SessionList({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const params = useParams<{ sessionId?: string }>();
  const [sessions, setSessions] = useState<S[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/chat/sessions${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (r.ok) setSessions((await r.json()).sessions);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    window.addEventListener("chat:refresh", load);
    return () => {
      clearTimeout(t);
      window.removeEventListener("chat:refresh", load);
    };
  }, [load, q]);

  const grouped = useMemo(() => {
    const now = new Date();
    const m = new Map<string, S[]>();
    for (const s of sessions) {
      const g = group(s, now);
      m.set(g, [...(m.get(g) ?? []), s]);
    }
    return ORDER.filter((g) => m.has(g)).map((g) => [g, m.get(g)!] as const);
  }, [sessions]);

  const patch = async (id: string, body: object) => {
    await fetch(`/api/chat/sessions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    load();
  };
  const rename = (s: S) => {
    const title = window.prompt("Rename chat", s.title);
    if (title?.trim()) patch(s.id, { title: title.trim() });
  };
  const remove = async (s: S) => {
    if (!window.confirm(`Delete "${s.title}"?`)) return;
    await fetch(`/api/chat/sessions/${s.id}`, { method: "DELETE" });
    toast.success("Chat deleted");
    if (params.sessionId === s.id) router.push("/chat");
    load();
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <Button asChild className="w-full justify-start" variant="outline" onClick={onNavigate}>
        <Link href="/chat"><Plus /> New chat</Link>
      </Button>
      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="h-9 pl-8" />
      </div>
      <nav className="-mx-1 flex-1 overflow-y-auto px-1">
        {grouped.length === 0 && <p className="text-muted-foreground px-2 py-4 text-xs">No chats yet.</p>}
        {grouped.map(([g, items]) => (
          <div key={g} className="mb-3">
            <p className="text-muted-foreground px-2 py-1 text-xs font-medium">{g}</p>
            {items.map((s) => (
              <div key={s.id} className={cn("group hover:bg-accent flex items-center rounded-md", params.sessionId === s.id && "bg-accent")}>
                <Link href={`/chat/${s.id}`} onClick={onNavigate} className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm">
                  {s.title}
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 opacity-100 md:opacity-0 md:group-hover:opacity-100" aria-label="Chat options">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => patch(s.id, { pinned: !s.pinned })}>{s.pinned ? <PinOff /> : <Pin />} {s.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => rename(s)}><Pencil /> Rename</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(s)}><Trash2 /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
