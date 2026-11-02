"use client";

import { useRouter } from "next/navigation";
import { FlowChart } from "./flow-chart";

const label = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function MonthSelect({ months, value }: { months: string[]; value: string }) {
  const router = useRouter();
  return (
    <select aria-label="Month" className="border-input bg-background h-9 rounded-md border px-2 text-sm" value={value} onChange={(e) => router.push(`/insights?month=${e.target.value}`)}>
      {[...months].reverse().map((m) => <option key={m} value={m}>{label(m)}</option>)}
    </select>
  );
}

export function FlowChartLinked({ data }: { data: { month: string; spend: number; income: number }[] }) {
  const router = useRouter();
  return <FlowChart data={data} onPick={(m) => router.push(`/insights?month=${m}`)} />;
}
