import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CreditCard, Landmark, MessageSquare, ShieldCheck, Wallet } from "lucide-react";
import { TagBars } from "@/components/dashboard/tag-bars";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { money, relative, shortDate } from "@/lib/format";
import { dashboardSummary } from "@/lib/queries";

export const metadata = { title: "Dashboard" };

function Stat({ title, value, sub, icon: Icon }: { title: string; value: string; sub?: React.ReactNode; icon: typeof Wallet }) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardDescription>{title}</CardDescription>
        <Icon className="text-muted-foreground size-4" />
      </CardHeader>
      <CardContent>
        <p className="tabular text-lg font-semibold sm:text-2xl">{value}</p>
        {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default async function Dashboard() {
  const user = await requireUser();
  const s = await dashboardSummary(user._id);
  const cur = user.currency;
  if (!s.hasItems) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState icon={Landmark} title="Connect a bank to get started" description="Your balances, spending and due dates will appear here once a bank is linked.">
          <Button asChild><Link href="/accounts">Go to Accounts</Link></Button>
        </EmptyState>
      </>
    );
  }
  const util = s.cardLimitCents ? Math.round((s.cardBalanceCents / s.cardLimitCents) * 100) : null;
  const delta = s.spendLastMonth ? Math.round(((s.spendThisMonth - s.spendLastMonth) / s.spendLastMonth) * 100) : null;

  return (
    <>
      <PageHeader title="Dashboard" description={`Last synced ${relative(s.lastSyncedAt)}`}>
        <Button asChild variant="outline"><Link href="/chat"><MessageSquare /> Ask MoneyPilot</Link></Button>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat title="Cash on hand" value={money(s.cashCents, cur)} icon={Wallet} sub="Checking + savings" />
        <Stat title="Card balances" value={money(s.cardBalanceCents, cur)} icon={CreditCard} sub={util !== null ? `${util}% utilization` : undefined} />
        <Stat
          title="Spent this month"
          value={money(s.spendThisMonth, cur)}
          icon={delta !== null && delta > 0 ? ArrowUpRight : ArrowDownRight}
          sub={`Last month ${money(s.spendLastMonth, cur)}${delta !== null ? ` · ${delta > 0 ? "+" : ""}${delta}% so far` : ""}`}
        />
        <Stat title="Open claims" value="—" icon={ShieldCheck} sub="Claims arrive in Phase 8" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Top tags this month</CardTitle></CardHeader>
          <CardContent>
            {s.topTags.length ? <TagBars data={s.topTags} currency={cur} /> : <p className="text-muted-foreground text-sm">No tagged spending yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="size-4" /> Due in 30 days</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {s.upcoming.length === 0 && <p className="text-muted-foreground text-sm">Nothing due.</p>}
            {s.upcoming.map((b) => (
              <div key={b._id} className="flex items-center justify-between text-sm">
                <div><p className="font-medium">{b.name}</p><p className="text-muted-foreground text-xs">{shortDate(b.dueDate)}</p></div>
                <span className="tabular">{money(b.amountCents, cur)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent transactions</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link href="/transactions">View all</Link></Button>
        </CardHeader>
        <CardContent className="divide-y">
          {s.recent.map((t) => (
            <div key={t._id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{t.description ?? t.merchant ?? t.name}</p>
                <p className="text-muted-foreground text-xs">{shortDate(t.date)}{t.pending ? " · pending" : ""}</p>
              </div>
              <span className={`tabular shrink-0 ${t.amountCents < 0 ? "text-success" : ""}`}>{money(t.amountCents, t.currency, { sign: true })}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
