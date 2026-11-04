import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { requireUser } from "@/lib/auth/session";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { repos } from "@/lib/db/repos";
import { listTransactions } from "@/lib/queries";
import { accountLabel, accountTitle } from "@/lib/accounts";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const accountIds = [sp.account].flat().filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 100).slice(0, 50);
  const tagId = typeof sp.tag === "string" ? sp.tag : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total, pageSize, accounts, tags }, items] = await Promise.all([
    listTransactions(user._id, { q, accountIds, tagId, page }),
    repos(user._id).items.find({}, { projection: { institutionName: 1 } }),
  ]);
  const institution = new Map(items.map((i) => [i._id, i.institutionName]));
  /** Card mask, type and bank name for the Dispute or refund helper. */
  const acctInfo = (id?: string) => {
    const a = acct.get(id ?? "");
    return a ? { accountMask: a.mask, accountType: a.type, institution: institution.get(a.itemId) } : {};
  };
  const acct = new Map(accounts.map((a) => [a._id, a]));
  /** Nickname in the list; nickname + bank name + mask in the drawer. */
  const acctName = (id?: string) => {
    const a = acct.get(id ?? "");
    return a ? { account: accountTitle(a), accountFull: accountLabel(a) } : { account: "Manual" };
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) =>
    `/transactions?${new URLSearchParams([...(q ? [["q", q]] : []), ...accountIds.map((id) => ["account", id]), ...(tagId ? [["tag", tagId]] : []), ["page", String(p)]])}`;
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ _id: t._id, name: t.name, color: t.color }));

  return (
    <>
      <PageHeader title="Transactions" description={`${total.toLocaleString()} transactions`} />
      <TransactionFilters
        q={q} accountIds={accountIds} tagId={tagId} tags={sorted}
        accounts={accounts.map((a) => ({ _id: a._id, name: a.name, nickname: a.nickname, officialName: a.officialName, mask: a.mask, archived: !!a.archivedAt }))}
      />
      {rows.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="No transactions found" description={q || accountIds.length || tagId ? "Try a different search or account." : "Connect a bank on Accounts to import transactions."} />
      ) : (
        <TransactionsTable
          tags={sorted}
          userName={user.name}
          rows={rows.map((t) => ({
            _id: t._id, date: new Date(t.date).toISOString(), name: t.name, merchant: t.merchant, description: t.description, notes: t.notes,
            amountCents: t.amountCents, currency: t.currency, ...acctName(t.accountId), category: t.category,
            categoryDetailed: t.categoryDetailed, tagIds: t.tagIds ?? [], pending: t.pending, source: t.source,
            ...acctInfo(t.accountId),
          }))}
        />
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
