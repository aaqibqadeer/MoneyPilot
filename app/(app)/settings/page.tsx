import { HistoryList } from "@/components/changes/history-list";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { changeHistory } from "@/lib/queries";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const rows = await changeHistory(user._id);
  return (
    <>
      <PageHeader title="Settings" description="Security and profile settings are coming in a later phase." />
      <Card id="history">
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Every edit you or the chat made. Undo works while the data hasn&apos;t changed since.</CardDescription>
        </CardHeader>
        <CardContent>
          <HistoryList rows={rows.map((r) => ({ _id: r._id, summary: r.summary, origin: r.origin, status: r.status, createdAt: new Date(r.createdAt).toISOString(), opCount: r.opCount }))} />
        </CardContent>
      </Card>
    </>
  );
}
