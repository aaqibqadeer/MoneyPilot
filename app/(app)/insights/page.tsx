import Link from "next/link";
import { ChartLine } from "lucide-react";
import { TagBars } from "@/components/dashboard/tag-bars";
import { FlowChartLinked, MonthSelect } from "@/components/insights/month-picker";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { money, shortDate } from "@/lib/format";
import { monthKey, monthlyFlow, monthReport } from "@/lib/insights";
import { cn } from "@/lib/utils";

export const metadata = { title: "Insights" };

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("tabular text-lg font-semibold", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
    </div>
  );
}

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const user = await requireUser();
  const cur = user.currency;
  const flow = await monthlyFlow(user._id);
  const sp = await searchParams;
  const months = flow.map((f) => f.month);
  const month = typeof sp.month === "string" && months.includes(sp.month) ? sp.month : monthKey(new Date());
  const r = await monthReport(user._id, month);
  if (!flow.some((f) => f.spend || f.income)) {
    return (
      <>
        <PageHeader title="Insights" />
        <EmptyState icon={ChartLine} title="No activity yet" description="Link a bank or import a statement and your monthly reports appear here." />
      </>
    );
  }
  const past = flow.slice(0, -1).filter((f) => f.spend || f.income);
  const avgSpend = past.length ? Math.round(past.reduce((s, f) => s + f.spend, 0) / past.length) : null;
  return (
    <>
      <PageHeader title="Insights" description="Monthly reports, tag trends, cash flow and merchants. Transfers are left out.">
        <MonthSelect months={months} value={month} />
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Spent" value={money(r.spend, cur)} sub={avgSpend !== null ? `Monthly avg ${money(avgSpend, cur)}` : undefined} />
        <Stat label="Income" value={money(r.income, cur)} />
        <Stat label="Net" value={money(r.net, cur)} tone={r.net >= 0 ? "good" : "bad"} sub={r.savingsRate !== null ? `${r.savingsRate}% saved` : undefined} />
        <Stat label="Biggest expense" value={r.biggest ? money(r.biggest.amountCents, cur) : "—"} sub={r.biggest ? `${r.biggest.name} · ${shortDate(r.biggest.date)}` : undefined} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Cash flow, last 12 months</CardTitle>
          <CardDescription>Tap a month to open its report.</CardDescription>
        </CardHeader>
        <CardContent><FlowChartLinked data={flow} /></CardContent>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Spending by tag</CardTitle><CardDescription>Change vs the month before</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {r.tags.length ? <TagBars data={r.tags.filter((t) => t.total).slice(0, 8)} currency={cur} /> : <p className="text-muted-foreground text-sm">No spending this month.</p>}
            <ul className="divide-y text-sm">
              {r.tags.slice(0, 8).map((t) => {
                const d = t.prev ? Math.round(((t.total - t.prev) / t.prev) * 100) : null;
                return (
                  <li key={t.name} className="flex justify-between gap-2 py-1.5">
                    <span className="truncate">{t.name}</span>
                    <span className={cn("tabular text-xs", d !== null && d > 10 && "text-destructive", d !== null && d < -10 && "text-success")}>
                      {d === null ? "new" : `${d > 0 ? "+" : ""}${d}%`} <span className="text-muted-foreground">(was {money(t.prev, cur)})</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top merchants</CardTitle><CardDescription>Tap one to see its transactions</CardDescription></CardHeader>
          <CardContent>
            {!r.merchants.length && <p className="text-muted-foreground text-sm">No spending this month.</p>}
            <ul className="divide-y">
              {r.merchants.map((m) => (
                <li key={m.name}>
                  <Link href={`/transactions?q=${encodeURIComponent(m.name)}`} className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{m.name}</span><span className="text-muted-foreground text-xs">{m.count} transaction{m.count === 1 ? "" : "s"}</span></span>
                    <span className="tabular shrink-0">{money(m.total, cur)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
