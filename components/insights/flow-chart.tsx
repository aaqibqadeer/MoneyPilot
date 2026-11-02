"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config: ChartConfig = { income: { label: "Income", color: "var(--success)" }, spend: { label: "Spend", color: "var(--chart-2)" } };
const short = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const k = (v: unknown) => (typeof v === "number" ? (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))) : String(v));

/** Income vs spend per month, in dollars. Bars link to that month's report. */
export function FlowChart({ data, onPick }: { data: { month: string; spend: number; income: number }[]; onPick?: (month: string) => void }) {
  const rows = data.map((d) => ({ month: d.month, label: short(d.month), income: d.income / 100, spend: d.spend / 100 }));
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full sm:h-64">
      <BarChart data={rows} margin={{ left: 0, right: 4 }} onClick={(e) => { const m = rows[Number(e?.activeTooltipIndex)]?.month; if (m && onPick) onPick(m); }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} width={36} tickFormatter={k} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={3} />
        <Bar dataKey="spend" fill="var(--color-spend)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}
