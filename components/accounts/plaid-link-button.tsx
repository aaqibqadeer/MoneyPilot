"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/** Opens Plaid Link. With itemId it runs update mode (re-auth). */
export function PlaidLinkButton({
  itemId, production, disabled, label,
}: { itemId?: string; production?: boolean; disabled?: boolean; label?: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(false);

  const onSuccess = useCallback(
    async (publicToken: string | null) => {
      if (!publicToken) return;
      setBusy(true);
      try {
        if (!itemId) {
          const r = await fetch("/api/plaid/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publicToken }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          toast.success(`Connected. Imported ${j.added} transactions.`);
        } else {
          await fetch("/api/plaid/sync", { method: "POST" });
          toast.success("Connection repaired");
        }
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message || "Could not finish linking");
      } finally {
        setBusy(false);
        setToken(null);
      }
    },
    [itemId, router],
  );


  const start = async () => {
    setWarn(false);
    setBusy(true);
    try {
      const r = await fetch("/api/plaid/link-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setToken(j.linkToken);
    } catch (e) {
      toast.error((e as Error).message || "Could not start Plaid Link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => (production && !itemId ? setWarn(true) : start())}
        disabled={disabled || busy}
        variant={itemId ? "outline" : "default"}
        size={itemId ? "sm" : "default"}
      >
        {busy ? <Loader2 className="animate-spin" /> : itemId ? <RefreshCw /> : <Plus />}
        {label ?? (itemId ? "Reconnect" : "Connect bank")}
      </Button>
      {token && <LinkOpener token={token} onSuccess={onSuccess} onExit={() => setToken(null)} />}
      <Dialog open={warn} onOpenChange={setWarn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Production connection</DialogTitle>
            <DialogDescription>
              Plaid production allows only 10 Items (bank logins) over the lifetime of this app, and removing one does
              not give the slot back. Only connect banks you intend to keep.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWarn(false)}>Cancel</Button>
            <Button onClick={start}>I understand, continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SyncNowButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/plaid/sync", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const errs = j.results.filter((x: { error?: string }) => x.error);
      if (errs.length) toast.error(errs[0].error);
      else toast.success("Synced");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onClick={sync} disabled={disabled || busy}>
      <RefreshCw className={busy ? "animate-spin" : ""} /> Sync now
    </Button>
  );
}

/** Mounted only while a link token exists, so the Plaid script loads once and only when needed. */
function LinkOpener({ token, onSuccess, onExit }: { token: string; onSuccess: (t: string | null) => void; onExit: () => void }) {
  const { open, ready } = usePlaidLink({ token, onSuccess, onExit });
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  return null;
}
