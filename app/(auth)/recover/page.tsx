import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Recover account" };

/** Recovery codes and email magic links arrive with the rest of Phase 1. */
export default function RecoverPage() {
  return (
    <Card>
      <CardContent className="space-y-3 text-center text-sm">
        <p className="font-medium">Account recovery is coming soon</p>
        <p className="text-muted-foreground">Recovery codes and email magic links are planned for Phase 1. Until then, sign in with a synced passkey (iCloud Keychain, Google Password Manager or 1Password).</p>
        <Link href="/login" className="underline">Back to sign in</Link>
      </CardContent>
    </Card>
  );
}
