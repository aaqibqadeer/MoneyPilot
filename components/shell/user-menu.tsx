"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, LogOut, Monitor, Moon, Palette, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { setThemeAction } from "@/app/actions/preferences";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEMES, type ThemeName } from "@/lib/themes";

export function UserMenu({ name, demo, palette: initial }: { name: string; demo: boolean; palette: ThemeName }) {
  const [palette, setPalette] = useState(initial);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [, start] = useTransition();
  const initials = (name || "You").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const pickPalette = (p: ThemeName) => {
    document.documentElement.setAttribute("data-theme", p);
    setPalette(p);
    start(() => setThemeAction(p));
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{name || "Signed in"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon /> : theme === "system" ? <Monitor /> : <Sun />} Appearance
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {(["light", "dark", "system"] as const).map((m) => (
              <DropdownMenuItem key={m} onSelect={() => setTheme(m)} className="capitalize">
                {m === "light" ? <Sun /> : m === "dark" ? <Moon /> : <Monitor />} {m}
                {theme === m && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette /> Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {(Object.keys(THEMES) as ThemeName[]).map((p) => (
              <DropdownMenuItem key={p} onSelect={() => pickPalette(p)}>
                {THEMES[p].label}
                {palette === p && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings /> Settings
        </DropdownMenuItem>
        {!demo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout}>
              <LogOut /> Log out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
