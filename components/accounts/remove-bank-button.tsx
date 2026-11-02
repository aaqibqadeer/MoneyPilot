"use client";

import { useState, useTransition } from "react";
import { Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { removeBank } from "@/app/actions/bank";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function RemoveBankButton({ itemId, name }: { itemId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive"><Unlink /> Remove</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {name}?</DialogTitle>
          <DialogDescription>
            This disconnects the bank at Plaid and deletes its accounts, synced transactions (with your notes and tags on them), card details and card due-date bills. Imported and manual transactions are kept. It can&apos;t be undone; export from Settings first if you want a copy.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive" disabled={pending}
            onClick={() => start(async () => {
              const r = await removeBank(itemId);
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.message);
              setOpen(false);
            })}
          >
            {pending && <Loader2 className="animate-spin" />}Remove bank
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
