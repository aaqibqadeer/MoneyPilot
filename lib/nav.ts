import {
  ArrowLeftRight, CalendarClock, ChartLine, FileText, LayoutDashboard, Landmark, MessageSquare, Settings, ShieldCheck, Tags,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Every app route (CLAUDE.md §4). Sidebar, command palette and tests read this list. */
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/bills", label: "Bills", icon: CalendarClock },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/claims", label: "Claims", icon: ShieldCheck },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/insights", label: "Insights", icon: ChartLine },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
