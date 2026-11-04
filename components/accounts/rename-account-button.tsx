"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import { renameAccount } from "@/app/actions/edits";
import { runAction } from "@/components/changes/run-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Pencil button + dialog to set the user's own name for an account. Empty clears it. Undoable. */
export function RenameAccountButton({ id, name, mask, nickname }: { id: string; name: string; mask?: string; nickname?: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(nickname ?? "");
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await runAction(renameAccount(id, value), value.trim() ? `Renamed to ${value.trim()}` : "Nickname removed");
      if (r.ok) setOpen(false);
    });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(nickname ?? ""); }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={`Rename ${nickname || name}`} title="Rename">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Name this account</DialogTitle>
          <DialogDescription>
            Your own name for {name}{mask ? ` •••${mask}` : ""}. The bank&apos;s name stays visible beside it, and you can search by either.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} placeholder={`e.g. Joint card, Bills account`} aria-label="Nickname" />
          <DialogFooter className="mt-4">
            {nickname && <Button type="button" variant="ghost" className="sm:mr-auto" disabled={pending} onClick={() => { setValue(""); start(async () => { const r = await runAction(renameAccount(id, ""), "Nickname removed"); if (r.ok) setOpen(false); }); }}>Remove nickname</Button>}
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
