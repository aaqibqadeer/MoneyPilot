import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { categoryLabel, money, shortDate } from "@/lib/format";
import { listTransactions } from "@/lib/queries";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const accountId = typeof sp.account === "string" ? sp.account : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, pageSize, accounts, tags } = await listTransactions(user._id, { q, accountId, page });
  const acct = new Map(accounts.map((a) => [a._id, a]));
  const tagMap = new Map(tags.map((t) => [t._id, t]));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `/transactions?${new URLSearchParams({ ...(q ? { q } : {}), ...(accountId ? { account: accountId } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Transactions" description={`${total.toLocaleString()} transactions`} />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" action="/transactions">
        <Input name="q" defaultValue={q} placeholder="Search name, merchant, notes…" className="sm:max-w-sm" />
        <select name="account" defaultValue={accountId ?? ""} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a._id} value={a._id}>{a.name}{a.mask ? ` •••${a.mask}` : ""}</option>)}
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="No transactions found" description={q || accountId ? "Try a different search or account." : "Connect a bank on Accounts to import transactions."} />
      ) : (
        <Card className="divide-y gap-0 py-0">
          {rows.map((t) => (
            <div key={t._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.description ?? t.merchant ?? t.name}</p>
                <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span>{shortDate(t.date)}</span>
                  <span className="hidden sm:inline">· {acct.get(t.accountId ?? "")?.name ?? "Manual"}</span>
                  <span className="hidden md:inline">· {categoryLabel(t.category)}</span>
                  {t.pending && <Badge variant="outline" className="h-4 px-1 text-[10px]">Pending</Badge>}
                  {t.tagIds.map((id) => {
                    const tag = tagMap.get(id);
                    return tag ? <Badge key={id} variant="secondary" className="h-4 px-1.5 text-[10px]" style={{ color: tag.color }}>{tag.name}</Badge> : null;
                  })}
                </div>
              </div>
              <span className={`tabular shrink-0 text-sm ${t.amountCents < 0 ? "text-success" : ""}`}>{money(t.amountCents, t.currency, { sign: true })}</span>
            </div>
          ))}
        </Card>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Button asChild variant="outline" size="sm" disabled={page <= 1}><Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1}>Previous</Link></Button>
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          <Button asChild variant="outline" size="sm" disabled={page >= pages}><Link href={href(Math.min(pages, page + 1))} aria-disabled={page >= pages}>Next</Link></Button>
        </div>
      )}
    </>
  );
}
