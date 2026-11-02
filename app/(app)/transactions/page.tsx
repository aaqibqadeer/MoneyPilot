import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { repos } from "@/lib/db/repos";
import { listTransactions } from "@/lib/queries";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const accountId = typeof sp.account === "string" ? sp.account : undefined;
  const tagId = typeof sp.tag === "string" ? sp.tag : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total, pageSize, accounts, tags }, items] = await Promise.all([
    listTransactions(user._id, { q, accountId, tagId, page }),
    repos(user._id).items.find({}, { projection: { institutionName: 1 } }),
  ]);
  const institution = new Map(items.map((i) => [i._id, i.institutionName]));
  /** Card mask, type and bank name for the Dispute or refund helper. */
  const acctInfo = (id?: string) => {
    const a = acct.get(id ?? "");
    return a ? { accountMask: a.mask, accountType: a.type, institution: institution.get(a.itemId) } : {};
  };
  const acct = new Map(accounts.map((a) => [a._id, a]));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) =>
    `/transactions?${new URLSearchParams({ ...(q ? { q } : {}), ...(accountId ? { account: accountId } : {}), ...(tagId ? { tag: tagId } : {}), page: String(p) })}`;
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ _id: t._id, name: t.name, color: t.color }));

  return (
    <>
      <PageHeader title="Transactions" description={`${total.toLocaleString()} transactions`} />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" action="/transactions">
        <Input name="q" defaultValue={q} placeholder="Search name, merchant, notes…" className="sm:max-w-sm" />
        <select name="account" defaultValue={accountId ?? ""} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a._id} value={a._id}>{a.name}{a.mask ? ` •••${a.mask}` : ""}{a.archivedAt ? " (archived)" : ""}</option>)}
        </select>
        <select name="tag" defaultValue={tagId ?? ""} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
          <option value="">All tags</option>
          <option value="none">Untagged</option>
          {sorted.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="No transactions found" description={q || accountId || tagId ? "Try a different search or account." : "Connect a bank on Accounts to import transactions."} />
      ) : (
        <TransactionsTable
          tags={sorted}
          userName={user.name}
          rows={rows.map((t) => ({
            _id: t._id, date: new Date(t.date).toISOString(), name: t.name, merchant: t.merchant, description: t.description, notes: t.notes,
            amountCents: t.amountCents, currency: t.currency, account: acct.get(t.accountId ?? "")?.name ?? "Manual", category: t.category,
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
