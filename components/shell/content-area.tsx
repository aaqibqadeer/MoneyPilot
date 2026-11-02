"use client";

import { usePathname } from "next/navigation";

/** Padded scrolling page area; chat routes get a full-bleed, fixed-height area instead. */
export function ContentArea({ children }: { children: React.ReactNode }) {
  const full = usePathname().startsWith("/chat");
  if (full) return <div className="min-h-0 flex-1">{children}</div>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-4 pb-16 sm:p-6">{children}</div>
    </div>
  );
}
