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
            This disconnects the bank at Plaid so it stops syncing, and moves it to Archived. Nothing is deleted: its accounts, transactions, tags, notes and bills stay fully viewable and searchable, including in chat. Balances are frozen and left out of dashboard totals. To sync it again later, connect the bank again.
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
            {pending && <Loader2 className="animate-spin" />}Disconnect and archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
