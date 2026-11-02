"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Request failed");
}

/** Recovery code or email link. Both sign in and land on Settings → Security to add a new passkey. */
export function RecoverForm({ token, emailEnabled }: { token?: string; emailEnabled: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"code" | "email" | "token" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const run = async (kind: "code" | "email" | "token", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const done = () => {
    router.replace("/settings?recovered=1#security");
    router.refresh();
  };

  if (token) {
    return (
      <Card>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm">Continue to sign in with your email link.</p>
          <Button className="w-full" disabled={!!busy} onClick={() => run("token", async () => { await post("/api/auth/magic/verify", { token }); done(); })}>
            {busy ? <Loader2 className="animate-spin" /> : <Mail />} Continue
          </Button>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Link href="/recover" className="text-muted-foreground text-sm underline">Other ways to recover</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run("code", async () => { await post("/api/auth/recover", { code }); done(); }); }}>
          <Label htmlFor="code">Recovery code</Label>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxx-xxxx-xxxx" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} />
          <Button className="w-full" type="submit" disabled={!!busy || code.length < 8}>
            {busy === "code" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Use recovery code
          </Button>
        </form>
        <Separator />
        {emailEnabled ? (
          sent ? (
            <p className="text-muted-foreground text-sm">If that email belongs to an account, a sign-in link is on its way. It works once and expires in 15 minutes.</p>
          ) : (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run("email", async () => { await post("/api/auth/magic", { email }); setSent(true); }); }}>
              <Label htmlFor="email">Email me a sign-in link</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <Button className="w-full" variant="outline" type="submit" disabled={!!busy || !email}>
                {busy === "email" ? <Loader2 className="animate-spin" /> : <Mail />} Send link
              </Button>
            </form>
          )
        ) : (
          <p className="text-muted-foreground text-sm">Email sign-in links are not configured on this server.</p>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        <p className="text-center text-sm"><Link href="/login" className="text-muted-foreground underline">Back to sign in</Link></p>
      </CardContent>
    </Card>
  );
}
