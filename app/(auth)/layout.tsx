import { LogoMark } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <LogoMark className="size-12" />
          <h1 className="text-xl font-semibold tracking-tight">MoneyPilot</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
