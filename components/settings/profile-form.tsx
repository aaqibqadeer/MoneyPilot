"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2, Trash2 } from "lucide-react";
import { deleteAccount, updateProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const select = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";
const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "PKR", "INR", "AUD", "AED", "SAR", "JPY"];

export function ProfileForm({ initial, demo }: { initial: { name: string; email: string; currency: string; timezone: string }; demo: boolean }) {
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [initial.timezone];
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateProfile(v);
          if (r.ok) toast.success("Profile saved");
          else toast.error(r.error);
        });
      }}
    >
      <div className="grid gap-1.5"><Label htmlFor="p-name">Name</Label><Input id="p-name" value={v.name} onChange={set("name")} maxLength={80} autoComplete="name" /></div>
      <div className="grid gap-1.5"><Label htmlFor="p-email">Email (recovery links)</Label><Input id="p-email" type="email" value={v.email} onChange={set("email")} autoComplete="email" disabled={demo} /></div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-cur">Currency</Label>
        <select id="p-cur" className={select} value={v.currency} onChange={set("currency")}>
          {[...new Set([v.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-tz">Time zone</Label>
        <select id="p-tz" className={select} value={v.timezone} onChange={set("timezone")}>
          {[...new Set([v.timezone, ...zones])].map((z) => <option key={z}>{z}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending || !dirty}>{pending && <Loader2 className="animate-spin" />}Save profile</Button></div>
    </form>
  );
}

export function DataControls({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline"><a href="/api/export" download><Download /> Export my data (JSON)</a></Button>
      <Dialog>
        <DialogTrigger asChild><Button variant="destructive" disabled={demo}><Trash2 /> Delete account</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your transactions, tags, bills, claims, documents, chats and passkeys. It can&apos;t be undone. Export first if you want a copy. Bank connections are not removed at Plaid automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5"><Label htmlFor="del">Type DELETE to confirm</Label><Input id="del" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" /></div>
          <DialogFooter>
            <Button
              variant="destructive" disabled={pending || text !== "DELETE"}
              onClick={() => start(async () => {
                const r = await deleteAccount(text);
                if (!r.ok) return void toast.error(r.error);
                router.replace("/login");
                router.refresh();
              })}
            >
              {pending && <Loader2 className="animate-spin" />}Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
