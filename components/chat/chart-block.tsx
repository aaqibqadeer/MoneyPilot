"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { z } from "zod";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartSpec = z.object({
  type: z.enum(["bar", "line", "pie", "area"]),
  title: z.string().optional(),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1).max(200),
  series: z.array(z.object({ key: z.string(), label: z.string().optional() })).min(1).max(6).optional(),
  xKey: z.string().optional(),
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const fmt = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v));

/** Renders ```chart JSON blocks from the model. Invalid JSON falls back to the raw code. */
export function ChartBlock({ code, isIncomplete }: { code: string; isIncomplete: boolean }) {
  if (isIncomplete) return <div className="bg-muted/50 my-3 h-48 animate-pulse rounded-xl" />;
  let spec: z.infer<typeof chartSpec>;
  try {
    spec = chartSpec.parse(JSON.parse(code));
  } catch {
    return <pre className="bg-muted my-3 overflow-x-auto rounded-lg p-3 text-xs">{code}</pre>;
  }
  const xKey = spec.xKey ?? "label";
  const series = spec.series ?? Object.keys(spec.data[0]).filter((k) => k !== xKey && typeof spec.data[0][k] === "number").map((key) => ({ key, label: key }));
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label ?? s.key, color: COLORS[i % COLORS.length] }]));

  return (
    <figure className="bg-card my-3 rounded-xl border p-3">
      {spec.title && <figcaption className="mb-2 text-sm font-medium">{spec.title}</figcaption>}
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        {spec.type === "pie" ? (
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey={xKey} />} />
            <Pie data={spec.data} dataKey={series[0].key} nameKey={xKey} innerRadius="45%" outerRadius="80%" paddingAngle={2}>
              {spec.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey={xKey} />} className="flex-wrap" />
          </PieChart>
        ) : spec.type === "line" ? (
          <LineChart data={spec.data} margin={{ left: 4, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={fmt} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {series.map((s) => <Line key={s.key} dataKey={s.key} stroke={`var(--color-${s.key})`} strokeWidth={2} dot={false} />)}
            {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
          </LineChart>
        ) : spec.type === "area" ? (
          <AreaChart data={spec.data} margin={{ left: 4, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={fmt} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {series.map((s) => <Area key={s.key} dataKey={s.key} stroke={`var(--color-${s.key})`} fill={`var(--color-${s.key})`} fillOpacity={0.2} />)}
          </AreaChart>
        ) : (
          <BarChart data={spec.data} margin={{ left: 4, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={fmt} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {series.map((s) => <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={4} />)}
            {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
          </BarChart>
        )}
      </ChartContainer>
    </figure>
  );
}
