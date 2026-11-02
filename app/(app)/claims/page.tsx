import { ClaimsView } from "@/components/claims/claims-view";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/lib/auth/session";
import { listClaims } from "@/lib/queries";

export const metadata = { title: "Claims" };

const iso = (d?: Date) => (d ? new Date(d).toISOString() : undefined);

export default async function ClaimsPage() {
  const user = await requireUser();
  const claims = await listClaims(user._id);
  return (
    <>
      <PageHeader title="Claims" description="Insurance claims, reimbursements and refunds from draft to paid." />
      <ClaimsView
        currency={user.currency}
        claims={claims.map((c) => ({
          _id: c._id, title: c.title, kind: c.kind, counterparty: c.counterparty, status: c.status, claimedCents: c.claimedCents, approvedCents: c.approvedCents,
          paidCents: c.paidCents, deadlineAt: iso(c.deadlineAt), notes: c.notes, documentIds: c.documentIds, timeline: c.timeline.map((t) => ({ at: iso(t.at)!, note: t.note })),
        }))}
      />
    </>
  );
}
