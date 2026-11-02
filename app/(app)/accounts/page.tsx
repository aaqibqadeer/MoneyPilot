import { AlertTriangle, CheckCircle2, CreditCard, Landmark } from "lucide-react";
import { PlaidLinkButton, SyncNowButton } from "@/components/accounts/plaid-link-button";
import { RemoveBankButton } from "@/components/accounts/remove-bank-button";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/session";
import { env, features } from "@/lib/env";
import { money, relative, shortDate } from "@/lib/format";
import { accountsOverview } from "@/lib/queries";

export const metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const user = await requireUser();
  const items = await accountsOverview(user._id);
  const production = env.PLAID_ENV === "production";
  const canLink = features.plaid;

  return (
    <>
      <PageHeader title="Accounts" description={`Bank connections via Plaid (${env.PLAID_ENV}).`}>
        {items.length > 0 && <SyncNowButton disabled={!canLink} />}
        <PlaidLinkButton production={production} disabled={!canLink} />
      </PageHeader>

      {!canLink && (
        <Alert className="mb-6">
          <AlertTriangle />
          <AlertTitle>Plaid isn&apos;t configured</AlertTitle>
          <AlertDescription>
            {features.plaidKeys
              ? "Set ENCRYPTION_KEY (32 bytes, e.g. `openssl rand -base64 32`) so bank tokens can be stored encrypted, then redeploy."
              : "Set PLAID_CLIENT_ID and PLAID_SECRET (sandbox) to connect a bank."}
          </AlertDescription>
        </Alert>
      )}

      {items.length === 0 ? (
        <EmptyState icon={Landmark} title="No banks connected" description="Connect a bank to pull in accounts, balances, transactions and card due dates. In Sandbox, use user_good / pass_good.">
          <PlaidLinkButton production={production} disabled={!canLink} />
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {items.map((item) => (
            <Card key={item._id}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {item.institutionName}
                    {item.status === "ok" ? (
                      <Badge variant="secondary" className="gap-1"><CheckCircle2 className="text-success size-3" /> Healthy</Badge>
                    ) : (
                      <Badge variant="destructive">{item.status === "needs_reauth" ? "Needs re-auth" : "Error"}</Badge>
                    )}
                  </CardTitle>
                  <p className="text-muted-foreground mt-1 text-xs">Last synced {relative(item.lastSyncedAt)}</p>
                  {item.error && <p className="text-destructive mt-1 text-xs">{item.error}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {item.status !== "ok" && canLink && <PlaidLinkButton itemId={item._id} />}
                  <RemoveBankButton itemId={item._id} name={item.institutionName} />
                </div>
              </CardHeader>
              <CardContent className="divide-y">
                {item.accounts.map((a) => {
                  const util = a.type === "credit" && a.limitCents ? Math.min(100, Math.round(((a.currentCents ?? 0) / a.limitCents) * 100)) : null;
                  return (
                    <div key={a._id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-muted flex size-9 items-center justify-center rounded-lg">
                          {a.type === "credit" ? <CreditCard className="size-4" /> : <Landmark className="size-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{a.name} {a.mask && <span className="text-muted-foreground">•••{a.mask}</span>}</p>
                          <p className="text-muted-foreground text-xs capitalize">{a.subtype ?? a.type}</p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="tabular font-medium">{money(a.currentCents, a.currency)}</p>
                        {a.availableCents !== undefined && a.type !== "credit" && (
                          <p className="text-muted-foreground text-xs">Available {money(a.availableCents, a.currency)}</p>
                        )}
                        {util !== null && (
                          <div className="mt-1 flex items-center gap-2 sm:justify-end">
                            <Progress value={util} className="h-1.5 w-24" />
                            <span className="text-muted-foreground text-xs">{util}% of {money(a.limitCents, a.currency)}</span>
                          </div>
                        )}
                        {a.liability?.nextPaymentDueDate && (
                          <p className="text-muted-foreground text-xs">
                            Due {shortDate(a.liability.nextPaymentDueDate)} · min {money(a.liability.minimumPaymentCents)} · stmt {money(a.liability.lastStatementBalanceCents)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
