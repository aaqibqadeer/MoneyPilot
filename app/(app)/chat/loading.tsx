import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="text-muted-foreground flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
