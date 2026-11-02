import { BillsView } from "@/components/bills/bills-view";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/lib/auth/session";
import { billsOverview } from "@/lib/queries";

export const metadata = { title: "Bills" };

export default async function BillsPage() {
  const user = await requireUser();
  const { bills, recurring } = await billsOverview(user._id);
  return (
    <>
      <PageHeader title="Bills" description="Card due dates, your own bills and recurring charges. Marking paid can be undone." />
      <BillsView
        currency={user.currency}
        bills={bills.map((b) => ({ _id: b._id, name: b.name, amountCents: b.amountCents, dueDate: new Date(b.dueDate).toISOString(), source: b.source, status: b.status, recurrence: b.recurrence }))}
        recurring={recurring.map((r) => ({ key: r.key, name: r.name, recurrence: r.recurrence, amountCents: r.amountCents, count: r.count, nextDate: r.nextDate.toISOString() }))}
      />
    </>
  );
}
