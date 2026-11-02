"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SessionList } from "./session-list";

/** Desktop: session list on the left. Mobile: list in a sheet. */
export function ChatLayoutShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r p-3 md:block">
        <SessionList />
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Button variant="ghost" size="sm" className="bg-background/80 absolute top-2 left-2 z-10 backdrop-blur md:hidden" onClick={() => setOpen(true)}>
          <History /> Chats
        </Button>
        {children}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-3">
          <SheetHeader className="p-0"><SheetTitle>Chats</SheetTitle></SheetHeader>
          <SessionList onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
