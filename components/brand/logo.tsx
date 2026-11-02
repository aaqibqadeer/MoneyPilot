import { cn } from "@/lib/utils";

/** Mark geometry (32×32 grid). Shared with scripts/brand-assets.mjs and app/icon.svg. */
export const LOGO_PATHS = { trend: "M9 23V9.5l7 7 7.5-7.5", head: "M17.5 9H23.5V15", dot: [23.5, 22.5, 2] } as const;

/** MoneyPilot mark: an "M" whose last stroke takes off, plus a destination dot. Follows the active theme's primary colours. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <g fill="none" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-foreground">
        <path d={LOGO_PATHS.trend} />
        <path d={LOGO_PATHS.head} />
      </g>
      <circle cx={LOGO_PATHS.dot[0]} cy={LOGO_PATHS.dot[1]} r={LOGO_PATHS.dot[2]} className="fill-primary-foreground" />
    </svg>
  );
}

/** Mark + wordmark. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark className={markClassName} />
      <span>MoneyPilot</span>
    </span>
  );
}
