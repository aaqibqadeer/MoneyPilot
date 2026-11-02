import { redirect } from "next/navigation";
import { RecoverForm } from "@/components/auth/recover-form";
import { getCurrentUser } from "@/lib/auth/session";
import { features } from "@/lib/env";

export const metadata = { title: "Recover account" };

export default async function RecoverPage({ searchParams }: PageProps<"/recover">) {
  if (features.demo || (await getCurrentUser())) redirect("/");
  const { token } = await searchParams;
  return <RecoverForm token={typeof token === "string" ? token : undefined} emailEnabled={features.email} />;
}
