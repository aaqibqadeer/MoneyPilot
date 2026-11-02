import {
  ArrowLeftRight, CalendarClock, ChartLine, FileText, LayoutDashboard, Landmark, MessageSquare, Settings, ShieldCheck, Tags,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Phase that builds this page out (CLAUDE.md §11). */
  phase: number;
}

/** Every app route (CLAUDE.md §4). Sidebar, command palette and tests read this list. */
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, phase: 4 },
  { href: "/chat", label: "Chat", icon: MessageSquare, phase: 5 },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, phase: 3 },
  { href: "/accounts", label: "Accounts", icon: Landmark, phase: 2 },
  { href: "/bills", label: "Bills", icon: CalendarClock, phase: 4 },
  { href: "/tags", label: "Tags", icon: Tags, phase: 3 },
  { href: "/claims", label: "Claims", icon: ShieldCheck, phase: 8 },
  { href: "/documents", label: "Documents", icon: FileText, phase: 8 },
  { href: "/insights", label: "Insights", icon: ChartLine, phase: 9 },
  { href: "/settings", label: "Settings", icon: Settings, phase: 9 },
];

export const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
