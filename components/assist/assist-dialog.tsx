"use client";

import { useState, useTransition } from "react";
import { Ban, Copy, ExternalLink, Gavel, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { createClaim } from "@/app/actions/edits";
import { runAction } from "@/components/changes/run-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelHelp, cancelLetter, DISPUTE_REASONS, disputeDeadline, disputeLetter, issuerHelp, mailto, refundLetter,
  type DisputeReason, type Letter,
} from "@/lib/assist";
import { money, shortDate } from "@/lib/format";

const select = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

/** Editable draft with Copy and Open-in-email. Re-key it to reset the text. */
function LetterBox({ letter }: { letter: Letter }) {
  const [body, setBody] = useState(letter.body);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${letter.subject}\n\n${body}`);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it.");
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium break-words">{letter.subject}</p>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-48 text-sm" aria-label="Message" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}><Copy />Copy</Button>
        <Button size="sm" variant="outline" asChild><a href={mailto({ subject: letter.subject, body })}><Mail />Open in email</a></Button>
      </div>
    </div>
  );
}

function OpenLink({ url, children }: { url: string; children: React.ReactNode }) {
  return <Button size="sm" asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink />{children}</a></Button>;
}

/** "Cancel" helper for a recurring charge: the service's own cancel page plus a cancellation email. */
export function CancelDialog({ merchant, amountCents, currency, account, userName }: { merchant: string; amountCents?: number; currency: string; account?: string; userName?: string }) {
  const info = cancelHelp(merchant);
  const mask = account?.match(/•••(\d{2,4})/)?.[1];
  const letter = cancelLetter({ merchant: info.known ? info.name : merchant, amountCents, currency, mask, name: userName });
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="ghost" aria-label={`Cancel ${merchant}`}><Ban /><span className="sr-only sm:not-sr-only">Cancel</span></Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cancel {info.known ? info.name : merchant}</DialogTitle>
          <DialogDescription>MoneyPilot can&apos;t cancel for you, but this gets you there fastest.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm">{info.steps}</p>
            {info.via && <p className="text-muted-foreground text-xs">Billed through {info.via === "apple" ? "Apple" : "Google Play"}: the service itself can&apos;t cancel it.</p>}
            <OpenLink url={info.url}>{info.known ? `Open ${info.via ? "subscriptions" : `${info.name} account`}` : "Find the cancel page"}</OpenLink>
          </div>
          <div className="space-y-1.5">
            <Label>Or send this email</Label>
            <LetterBox letter={letter} />
          </div>
          <p className="text-muted-foreground text-xs">After cancelling, delete the bill here (or leave it) and watch next month&apos;s statement. If they charge again, use Dispute or refund on that transaction.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface DisputeTxn {
  _id: string;
  merchant: string;
  amountCents: number;
  currency: string;
  date: string;
  mask?: string;
  accountType?: string;
  institution?: string;
}

/** "Dispute or refund": ask the merchant first, then the card issuer; optionally track it as a claim. */
export function DisputeDialog({ t, userName }: { t: DisputeTxn; userName?: string }) {
  const [reason, setReason] = useState<DisputeReason>("cancelled");
  const [pending, start] = useTransition();
  const [tracked, setTracked] = useState(false);
  const issuer = issuerHelp(t.institution);
  const facts = { merchant: t.merchant, amountCents: t.amountCents, date: t.date, currency: t.currency, mask: t.mask, accountType: t.accountType, reason, name: userName };
  const refund = refundLetter(facts);
  const dispute = disputeLetter({ ...facts, issuer: issuer.known ? issuer.name : undefined });
  const deadline = disputeDeadline(t.date, t.accountType);
  const track = () =>
    start(async () => {
      const r = await runAction(
        createClaim({
          title: `${t.merchant} ${money(t.amountCents, t.currency)} (${shortDate(t.date)})`.slice(0, 120),
          kind: "refund",
          counterparty: t.merchant.slice(0, 80),
          status: "draft",
          claimedCents: t.amountCents,
          deadlineAt: deadline.actBy,
          notes: DISPUTE_REASONS[reason],
          transactionIds: [t._id],
        }),
        "Added to Claims",
      );
      if (r.ok) setTracked(true);
    });

  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" className="w-full"><Gavel />Dispute or refund</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Get your money back</DialogTitle>
          <DialogDescription>{t.merchant} · {money(t.amountCents, t.currency)} · {shortDate(t.date)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reason">What went wrong?</Label>
            <select id="reason" className={select} value={reason} onChange={(e) => setReason(e.target.value as DisputeReason)}>
              {Object.entries(DISPUTE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <p className="bg-muted rounded-md p-2 text-xs">
            <span className="font-medium">Act by {shortDate(deadline.actBy)}.</span> {deadline.rule}
            {reason === "not_recognized" && " For a charge you don't recognize, call your bank now and ask them to replace the card."}
          </p>
          <Tabs defaultValue={reason === "not_recognized" ? "issuer" : "merchant"} key={reason === "not_recognized" ? "i" : "m"}>
            <TabsList className="w-full">
              <TabsTrigger value="merchant">1. Ask the merchant</TabsTrigger>
              <TabsTrigger value="issuer">2. Dispute with bank</TabsTrigger>
            </TabsList>
            <TabsContent value="merchant" className="space-y-2 pt-2">
              <p className="text-muted-foreground text-xs">Fastest fix and keeps the account in good standing. Send to their support email or contact form.</p>
              <LetterBox key={reason} letter={refund} />
            </TabsContent>
            <TabsContent value="issuer" className="space-y-2 pt-2">
              <p className="text-sm">{issuer.steps}</p>
              {issuer.url && <OpenLink url={issuer.url}>Open {issuer.name}</OpenLink>}
              <LetterBox key={reason} letter={dispute} />
            </TabsContent>
          </Tabs>
          <Button variant="secondary" className="w-full" disabled={pending || tracked} onClick={track}>
            {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{tracked ? "Tracking on Claims" : "Track it on Claims"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
