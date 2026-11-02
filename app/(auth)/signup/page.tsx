import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/passkey-forms";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { signupAllowed } from "@/lib/auth/webauthn";
import { features } from "@/lib/env";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  if (features.demo || (await getCurrentUser())) redirect("/");
  if (!(await signupAllowed())) {
    return (
      <Card><CardContent className="space-y-2 text-center text-sm">
        <p>Sign-up is closed.</p>
        <Link href="/login" className="underline">Sign in instead</Link>
      </CardContent></Card>
    );
  }
  return <SignupForm />;
}
