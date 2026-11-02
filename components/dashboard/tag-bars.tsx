import { money } from "@/lib/format";

/** Simple horizontal bars; no client JS needed. */
export function TagBars({ data, currency }: { data: { name: string; color: string; total: number }[]; currency: string }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.name} className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[8rem_1fr_auto]">
          <span className="truncate">{d.name}</span>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div className="h-full rounded-full" style={{ width: `${(d.total / max) * 100}%`, background: d.color }} />
          </div>
          <span className="tabular text-muted-foreground">{money(d.total, currency)}</span>
        </div>
      ))}
    </div>
  );
}
