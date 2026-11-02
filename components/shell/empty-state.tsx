import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon, title, description, children,
}: { icon: LucideIcon; title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
      <div className="bg-primary/10 text-primary mb-4 flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" />
      </div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
