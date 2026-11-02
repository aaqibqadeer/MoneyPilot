"use client";

import { browserSupportsWebAuthnAutofill, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Request failed");
  return j as T;
}

const friendly = (e: unknown) => {
  const n = (e as Error)?.name;
  if (n === "NotAllowedError" || n === "AbortError") return null; // user cancelled
  return (e as Error)?.message ?? "Something went wrong";
};

export function LoginForm({ signupOpen }: { signupOpen: boolean }) {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (useBrowserAutofill: boolean) => {
    const optionsJSON = await post<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/api/auth/login/options");
    const response = await startAuthentication({ optionsJSON, useBrowserAutofill });
    await post("/api/auth/login/verify", { response });
    router.replace(next.startsWith("/") ? next : "/");
    router.refresh();
  };

  // Conditional UI: passkeys offered in the username field's autofill.
  useEffect(() => {
    browserSupportsWebAuthnAutofill().then((ok) => {
      if (ok) finish(true).catch((e) => { const m = friendly(e); if (m) setError(m); });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const click = async () => {
    setBusy(true);
    setError(null);
    try {
      await finish(false);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Account</Label>
          <Input id="username" name="username" autoComplete="username webauthn" placeholder="Choose your passkey" />
        </div>
        <Button className="w-full" onClick={click} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Sign in with passkey
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="text-muted-foreground flex justify-between text-sm">
          <Link href="/recover" className="hover:text-foreground">Lost your passkey?</Link>
          {signupOpen && <Link href="/signup" className="hover:text-foreground">Create account</Link>}
        </div>
      </CardContent>
    </Card>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const optionsJSON = await post<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/auth/register/options", {
        name: name || undefined,
        email: email || undefined,
      });
      const response = await startRegistration({ optionsJSON });
      await post("/api/auth/register/verify", { response });
      router.replace("/settings?welcome=1#security");
      router.refresh();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (for account recovery)</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Create passkey
          </Button>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <p className="text-muted-foreground text-center text-sm">
            Have an account? <Link href="/login" className="hover:text-foreground underline">Sign in</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
