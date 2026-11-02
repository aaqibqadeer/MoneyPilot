import { HistoryList } from "@/components/changes/history-list";
import { SecurityPanel } from "@/components/settings/security-panel";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentTokenHash, requireUser } from "@/lib/auth/session";
import { features } from "@/lib/env";
import { changeHistory, securityOverview } from "@/lib/queries";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  const sp = await searchParams;
  const [rows, security] = await Promise.all([changeHistory(user._id), features.demo ? null : securityOverview(user._id, await currentTokenHash())]);
  return (
    <>
      <PageHeader title="Settings" description="Security and the history of every change." />
      {sp.welcome && (
        <Alert className="mb-4">
          <AlertTitle>Welcome to MoneyPilot</AlertTitle>
          <AlertDescription>Create recovery codes now so a lost phone never locks you out.</AlertDescription>
        </Alert>
      )}
      {sp.recovered && (
        <Alert className="mb-4">
          <AlertTitle>You signed in with a recovery method</AlertTitle>
          <AlertDescription>Add a new passkey below so you can sign in normally next time.</AlertDescription>
        </Alert>
      )}
      <div className="space-y-4">
        <Card id="security">
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>
              Passkeys, recovery codes and signed-in devices.{" "}
              {features.email ? `Email sign-in links go to ${user.email ?? "your email (none set)"}.` : "Email recovery is not configured (RESEND_API_KEY, EMAIL_FROM)."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {security ? <SecurityPanel data={security} /> : <p className="text-muted-foreground text-sm">Demo mode: security settings need a database (MONGODB_URI).</p>}
          </CardContent>
        </Card>
        <Card id="history">
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Every edit you or the chat made. Undo works while the data hasn&apos;t changed since.</CardDescription>
          </CardHeader>
          <CardContent>
            <HistoryList rows={rows.map((r) => ({ _id: r._id, summary: r.summary, origin: r.origin, status: r.status, createdAt: new Date(r.createdAt).toISOString(), opCount: r.opCount }))} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
