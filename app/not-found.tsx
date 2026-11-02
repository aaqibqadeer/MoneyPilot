import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-4xl font-semibold">404</p>
      <p className="text-muted-foreground text-sm">That page doesn&apos;t exist.</p>
      <Button asChild><Link href="/">Back to dashboard</Link></Button>
    </main>
  );
}
