import Link from "next/link";
import { cookies } from "next/headers";
import { LogoMark } from "@/components/brand/logo";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { ContentArea } from "@/components/shell/content-area";
import { ViewportSync } from "@/components/shell/viewport-sync";
import { UserMenu } from "@/components/shell/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth/session";
import { features } from "@/lib/env";
import { DEFAULT_THEME, isThemeName } from "@/lib/themes";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const jar = await cookies();
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";
  const palette = isThemeName(user.theme) ? user.theme : DEFAULT_THEME;
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar demo={features.demo} />
      <ViewportSync />
      <SidebarInset className="h-[var(--vvh,100dvh)] min-w-0 overflow-hidden">
        <header className="bg-background/80 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-4">
          <SidebarTrigger className="-ml-1 pointer-coarse:size-10" />
          <Link href="/" aria-label="MoneyPilot home" className="md:hidden">
            <LogoMark className="size-7" />
          </Link>
          <Separator orientation="vertical" className="mr-1 h-4 max-md:hidden" />
          <div className="flex flex-1 justify-center sm:justify-start">
            <CommandPalette />
          </div>
          <UserMenu name={user.name} demo={features.demo} palette={palette} />
        </header>
        {features.demo && (
          <div className="bg-warning/15 border-warning/30 shrink-0 border-b px-4 py-1.5 text-center text-xs">
            <span className="sm:hidden">Demo mode: sample data, resets on restart.</span>
            <span className="max-sm:hidden">Demo mode: no MONGODB_URI, so you&apos;re seeing sample data that resets on restart.</span>
          </div>
        )}
        <ContentArea>{children}</ContentArea>
      </SidebarInset>
    </SidebarProvider>
  );
}
