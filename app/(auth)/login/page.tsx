import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/passkey-forms";
import { getCurrentUser } from "@/lib/auth/session";
import { signupAllowed } from "@/lib/auth/webauthn";
import { features } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (features.demo || (await getCurrentUser())) redirect("/");
  return (
    <Suspense>
      <LoginForm signupOpen={await signupAllowed()} />
    </Suspense>
  );
}
