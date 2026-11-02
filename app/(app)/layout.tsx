import { cookies } from "next/headers";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { ContentArea } from "@/components/shell/content-area";
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
      <SidebarInset className="h-dvh min-w-0 overflow-hidden">
        <header className="bg-background/80 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <div className="flex flex-1 justify-center sm:justify-start">
            <CommandPalette />
          </div>
          <UserMenu name={user.name} demo={features.demo} palette={palette} />
        </header>
        {features.demo && (
          <div className="bg-warning/15 border-warning/30 shrink-0 border-b px-4 py-1.5 text-center text-xs">
            Demo mode: no MONGODB_URI, so you&apos;re seeing sample data that resets on restart.
          </div>
        )}
        <ContentArea>{children}</ContentArea>
      </SidebarInset>
    </SidebarProvider>
  );
}
