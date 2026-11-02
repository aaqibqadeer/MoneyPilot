import { NAV } from "@/lib/nav";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

const COPY: Record<string, string> = {
  "/bills": "Card due dates, manual bills and detected recurring charges in list and calendar views.",
  "/claims": "Track insurance claims, reimbursements and refunds from draft to paid.",
  "/documents": "Upload statements, receipts and letters; review extracted data before importing.",
  "/insights": "Monthly reports, category trends, cash flow and merchant drill-downs.",
  "/settings": "Profile, security, connections, AI usage, data export and account deletion.",
};

/** Placeholder for routes built in later phases. */
export function ComingSoon({ href }: { href: string }) {
  const n = NAV.find((x) => x.href === href)!;
  return (
    <>
      <PageHeader title={n.label} />
      <EmptyState icon={n.icon} title={`${n.label} is on the way`} description={COPY[href] ?? ""}>
        <span className="text-muted-foreground bg-muted rounded-full px-3 py-1 text-xs">Planned for Phase {n.phase}</span>
      </EmptyState>
    </>
  );
}
