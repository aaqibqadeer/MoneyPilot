"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, KeyRound, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { newRecoveryCodes, removePasskey, renamePasskey, revokeOtherSessions, revokeSession } from "@/app/actions/security";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deviceLabel, relative } from "@/lib/format";

export interface SecurityData {
  passkeys: { _id: string; name: string; createdAt: string; lastUsedAt?: string }[];
  sessions: { _id: string; userAgent?: string; lastSeenAt: string; current: boolean }[];
  recovery: { total: number; left: number };
}

type R = { ok: true } | { ok: false; error: string };
const report = (r: R, msg?: string) => {
  if (!r.ok) toast.error(r.error);
  else if (msg) toast.success(msg);
};

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Request failed");
  return j as T;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function SecurityPanel({ data }: { data: SecurityData }) {
  return (
    <div className="divide-y">
      <Passkeys rows={data.passkeys} />
      <RecoveryCodes {...data.recovery} />
      <Sessions rows={data.sessions} />
    </div>
  );
}

function Passkeys({ rows }: { rows: SecurityData["passkeys"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const optionsJSON = await post<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/auth/register/options");
      const response = await startRegistration({ optionsJSON });
      await post("/api/auth/register/verify", { response });
      toast.success("Passkey added");
      router.refresh();
    } catch (e) {
      const n = (e as Error).name;
      if (n !== "NotAllowedError" && n !== "AbortError") toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Passkeys" description="Sign in with Face ID, Touch ID, Windows Hello or a security key. Keep at least two.">
      <ul className="divide-y rounded-lg border">
        {rows.map((p) => <PasskeyRow key={p._id} p={p} only={rows.length === 1} />)}
      </ul>
      <Button variant="outline" size="sm" onClick={add} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add a passkey
      </Button>
    </Section>
  );
}

function PasskeyRow({ p, only }: { p: SecurityData["passkeys"][number]; only: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await renamePasskey(p._id, name);
    report(r, "Renamed");
    if (r.ok) setEditing(false);
  });
  return (
    <li className="flex items-center gap-2 p-3">
      <KeyRound className="text-muted-foreground size-4 shrink-0" />
      {editing ? (
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Passkey name" autoFocus />
          <Button size="icon-sm" type="submit" disabled={pending} aria-label="Save"><Check /></Button>
          <Button size="icon-sm" variant="ghost" type="button" onClick={() => setEditing(false)} aria-label="Cancel"><X /></Button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="text-muted-foreground text-xs">Added {relative(p.createdAt)} · last used {relative(p.lastUsedAt)}</p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Rename"><Pencil /></Button>
          <Button
            size="icon-sm" variant="ghost" disabled={pending || only} aria-label="Remove"
            onClick={() => confirm(`Remove "${p.name}"? You won't be able to sign in with it.`) && start(async () => report(await removePasskey(p._id), "Passkey removed"))}
          >
            <Trash2 />
          </Button>
        </>
      )}
    </li>
  );
}

function RecoveryCodes({ total, left }: SecurityData["recovery"]) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const generate = () => {
    if (total && !confirm("Create new codes? Your old codes stop working.")) return;
    start(async () => {
      const r = await newRecoveryCodes();
      if (r.ok) setCodes(r.codes);
      else toast.error(r.error);
    });
  };
  const text = codes?.join("\n") ?? "";
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`MoneyPilot recovery codes\nEach code works once.\n\n${text}\n`], { type: "text/plain" }));
    a.download = "moneypilot-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Section title="Recovery codes" description="One-time codes to get back in if you lose every passkey. Store them somewhere safe.">
      {codes ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Save these now. They won&apos;t be shown again.</p>
          <ol className="bg-muted grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg p-3 font-mono text-sm">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))}><Copy /> Copy</Button>
            <Button size="sm" variant="outline" onClick={download}><Download /> Download</Button>
            <Button size="sm" onClick={() => setCodes(null)}>I saved them</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {total ? (
            <Badge variant={left <= 2 ? "destructive" : "secondary"}>{left} of {total} left</Badge>
          ) : (
            <Badge variant="destructive">Not set up</Badge>
          )}
          <Button size="sm" variant="outline" onClick={generate} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {total ? "Create new codes" : "Create recovery codes"}
          </Button>
        </div>
      )}
    </Section>
  );
}

function Sessions({ rows }: { rows: SecurityData["sessions"] }) {
  const [pending, start] = useTransition();
  return (
    <Section title="Signed-in devices" description="Sessions last 30 days from last use. Revoke any you don't recognise.">
      <ul className="divide-y rounded-lg border">
        {rows.map((s) => (
          <li key={s._id} className="flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{deviceLabel(s.userAgent)}</p>
              <p className="text-muted-foreground text-xs">Active {relative(s.lastSeenAt)}</p>
            </div>
            {s.current ? (
              <Badge variant="secondary">This device</Badge>
            ) : (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => report(await revokeSession(s._id), "Signed out"))}>Revoke</Button>
            )}
          </li>
        ))}
      </ul>
      {rows.length > 1 && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => report(await revokeOtherSessions(), "Other devices signed out"))}>
          Sign out other devices
        </Button>
      )}
    </Section>
  );
}
