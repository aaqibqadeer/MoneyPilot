"use client";

import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";

/** Page-level error: keeps the shell and nav usable. Details stay in the server log. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState icon={AlertTriangle} title="Something went wrong" description={`This page hit an error${error.digest ? ` (ref ${error.digest})` : ""}. Your data is safe.`}>
      <Button onClick={reset}>Try again</Button>
    </EmptyState>
  );
}
