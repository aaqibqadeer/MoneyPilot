import { Wallet } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl">
            <Wallet className="size-5" />
          </div>
          <h1 className="text-xl font-semibold">MoneyPilot</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
