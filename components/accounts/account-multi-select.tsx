"use client";

import { useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { accountDetail, accountKeywords, accountTitle, type AccountLike } from "@/lib/accounts";
import { cn } from "@/lib/utils";

export type AccountOption = Omit<AccountLike, "archivedAt"> & { archived?: boolean };

/** Searchable multi-select of accounts (type a nickname, bank name or last 4). Empty selection = all accounts. */
export function AccountMultiSelect({ accounts, value, onChange, className }: { accounts: AccountOption[]; value: string[]; onChange: (ids: string[]) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const chosen = accounts.filter((a) => value.includes(a._id));
  const label = !chosen.length ? "All accounts" : chosen.length === 1 ? accountTitle(chosen[0]) : `${chosen.length} accounts`;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative min-w-0", className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label="Filter by account"
            className="border-input bg-background flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-left text-sm sm:h-9 sm:w-56"
          >
            <span className={cn("truncate", !chosen.length && "text-muted-foreground")}>{label}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        {chosen.length > 0 && (
          <button type="button" onClick={() => onChange([])} aria-label="Clear account filter" className="text-muted-foreground hover:text-foreground absolute top-1/2 right-8 -translate-y-1/2 p-1">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72">
        <Command>
          <CommandInput placeholder="Find by nickname, bank name or last 4…" />
          <CommandList>
            <CommandEmpty>No matching account.</CommandEmpty>
            <CommandGroup>
              {accounts.map((a) => {
                const on = value.includes(a._id);
                const detail = accountDetail(a);
                return (
                  <CommandItem key={a._id} value={a._id} keywords={accountKeywords(a)} data-checked={on} onSelect={() => toggle(a._id)} className="pointer-coarse:py-2.5">
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-sm border", on && "bg-primary border-primary text-primary-foreground")} aria-hidden>
                      {on && <span className="text-[10px] leading-none">✓</span>}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{accountTitle(a)}{a.archived && <span className="text-muted-foreground"> (archived)</span>}</span>
                      {detail && <span className="text-muted-foreground block truncate text-xs">{detail}</span>}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {value.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value="__all__" keywords={["all", "clear"]} onSelect={() => onChange([])}>Show all accounts</CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
