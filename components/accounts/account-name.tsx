import { accountDetail, accountTitle, type AccountLike } from "@/lib/accounts";
import { cn } from "@/lib/utils";

/** Nickname in bold with the bank's own name and mask beside it; just the bank name when there is no nickname. */
export function AccountName({ account, className }: { account: Omit<AccountLike, "_id">; className?: string }) {
  const detail = accountDetail(account);
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5", className)}>
      <span className="font-medium">{accountTitle(account)}</span>
      {detail && <span className="text-muted-foreground text-xs font-normal">{detail}</span>}
    </span>
  );
}
