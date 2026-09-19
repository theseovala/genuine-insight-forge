import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Inbox,
  MessageSquareReply,
  BarChart3,
  BellRing,
  MapPin,
  Swords,
  MessageCircleHeart,
  FileText,
  Settings,
  Search,
  HelpCircle,
  Bell,
  ChevronsUpDown,
  Menu,
  LogOut,
  UserRound,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-context";
import { alerts, locations, roles } from "@/lib/mock-data";
import { BrandMark, StatusBadge } from "./primitives";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const navItems = [
  { id: "dashboard", to: "/", label: "Dashboard", icon: LayoutDashboard },
  { id: "reviews", to: "/reviews", label: "Review Center", icon: Inbox, badge: 23 },
  { id: "responses", to: "/responses", label: "Response Center", icon: MessageSquareReply, badge: 5 },
  { id: "analytics", to: "/analytics", label: "Analytics", icon: BarChart3 },
  { id: "alerts", to: "/alerts", label: "Alerts", icon: BellRing, badge: 4, urgent: true },
  { id: "locations", to: "/locations", label: "Locations", icon: MapPin },
  { id: "competitors", to: "/competitors", label: "Competitors", icon: Swords },
  { id: "feedback", to: "/feedback", label: "Customer Feedback", icon: MessageCircleHeart },
  { id: "reports", to: "/reports", label: "Reports", icon: FileText },
  { id: "settings", to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const { can } = useApp();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => {
        const allowed = can(item.id);
        const link = (
          <Link
            key={item.id}
            to={item.to}
            onClick={onNavigate}
            activeOptions={{ exact: item.to === "/" }}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-muted transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              !allowed && "pointer-events-none opacity-35",
              collapsed && "justify-center px-0",
            )}
            activeProps={{
              className:
                "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-sidebar-primary",
            }}
          >
            <item.icon className="size-[18px] shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
            {!collapsed && "badge" in item && item.badge && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  "urgent" in item && item.urgent
                    ? "bg-negative text-destructive-foreground"
                    : "bg-sidebar-primary/20 text-sidebar-primary",
                )}
              >
                {item.badge}
              </span>
            )}
            {collapsed && "badge" in item && item.badge && (
              <span className={cn("absolute right-2 top-2 size-2 rounded-full", "urgent" in item && item.urgent ? "bg-negative" : "bg-sidebar-primary")} />
            )}
          </Link>
        );
        if (!collapsed) return link;
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}{!allowed && " · not in your role"}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function SidebarInner({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const { role } = useApp();
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-3 px-5 py-5", collapsed && "justify-center px-0")}>
        <BrandMark light />
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-display text-base font-extrabold text-sidebar-accent-foreground">
              RepuVala<span className="align-super text-[9px]">™</span>
            </p>
            <p className="text-[10px] font-medium tracking-wide text-sidebar-muted">Reputation Command Center</p>
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="mx-3 mb-3 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">Viewing as</p>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-accent-foreground">
            <ShieldCheck className="size-3.5 text-sidebar-primary" /> {role.name}
          </p>
        </div>
      )}
      <div className="scrollbar-thin flex-1 overflow-y-auto py-1">
        <NavList collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      <div className={cn("border-t border-sidebar-border px-5 py-4", collapsed && "px-2 text-center")}>
        {collapsed ? (
          <span className="text-[10px] font-bold text-sidebar-muted">SV™</span>
        ) : (
          <p className="text-[10px] leading-relaxed text-sidebar-muted">
            Powered by <span className="font-semibold text-sidebar-foreground">Software Vala™</span>
            <br />
            The Name of Trust
          </p>
        )}
      </div>
    </div>
  );
}

function TopBar({ onMenu, collapsed, onToggle }: { onMenu: () => void; collapsed: boolean; onToggle: () => void }) {
  const { location, setLocation, role, setRole } = useApp();
  const open = alerts.filter((a) => !a.resolved);
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu />
      </Button>
      <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={onToggle} aria-label="Toggle sidebar">
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>

      {/* Business / location selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex max-w-[220px] items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-left text-sm shadow-xs transition-colors hover:bg-accent md:max-w-xs">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-gradient-brand text-[10px] font-bold text-primary-foreground">AV</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Aroma Ventures</span>
              <span className="block truncate font-semibold">{location.name}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Switch location</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={location.id} onValueChange={setLocation}>
            {locations.map((l) => (
              <DropdownMenuRadioItem key={l.id} value={l.id} className="gap-2">
                <span className="flex-1">{l.name}</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{l.score}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Search */}
      <div className="relative ml-auto hidden w-full max-w-sm md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search reviews, locations, customers…"
          className="h-9 w-full rounded-lg border bg-card pl-9 pr-14 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">⌘K</kbd>
      </div>

      <div className="flex items-center gap-1 md:ml-2">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search"><Search /></Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Help"><HelpCircle /></Button>
          </TooltipTrigger>
          <TooltipContent>Help & guides</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-negative animate-pulse-dot" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="font-display text-sm font-bold">Notifications</p>
              <span className="text-xs text-muted-foreground">{open.length} unresolved</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {open.slice(0, 4).map((a) => (
                <Link key={a.id} to="/alerts" className="flex gap-3 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent/60">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.severity === "critical" || a.severity === "high" ? "bg-negative" : a.severity === "medium" ? "bg-warning" : "bg-info")} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">{a.location} · {a.time}</span>
                  </span>
                </Link>
              ))}
            </div>
            <Link to="/alerts" className="block border-t px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-accent/60">Open Alert Center</Link>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex items-center gap-2 rounded-full border bg-card p-1 pr-1 transition-colors hover:bg-accent md:pr-3">
              <span className="grid size-7 place-items-center rounded-full bg-gradient-brand text-xs font-bold text-primary-foreground">RM</span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-xs font-semibold">Rohan Mehta</span>
                <span className="block text-[10px] text-muted-foreground">{role.name}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>
              <p className="text-sm font-semibold">Rohan Mehta</p>
              <p className="text-xs font-normal text-muted-foreground">rohan@repuvala.example</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preview as role</DropdownMenuLabel>
            <div className="max-h-64 overflow-y-auto">
              {roles.map((r) => (
                <DropdownMenuItem key={r.id} onClick={() => setRole(r.id)} className="flex items-center gap-2">
                  <span className={cn("grid size-4 place-items-center", role.id !== r.id && "opacity-0")}><Check className="size-3.5 text-primary" /></span>
                  <span className="flex-1 text-sm">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground">{r.scope}</span>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/settings"><UserRound /> Account settings</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/login"><LogOut /> Sign out</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground">RepuVala™ · Powered by Software Vala™</p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out lg:block",
            collapsed ? "w-[76px]" : "w-[264px]",
          )}
        >
          <SidebarInner collapsed={collapsed} />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarInner collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setMobileOpen(true)} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          <main key={pathname} className="flex-1 px-4 py-6 md:px-6 lg:px-8 animate-fade">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
          <footer className="flex flex-col gap-2 border-t px-4 py-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
            <p>
              <span className="font-semibold text-foreground">RepuVala™</span> — Your Reputation. One Powerful Command Center.
            </p>
            <p className="flex items-center gap-2">
              <StatusBadge status="Prototype" className="bg-accent text-primary" />
              Powered by <span className="font-semibold text-foreground">Software Vala™</span> · The Name of Trust
            </p>
          </footer>
        </div>
      </div>
      <span className="sr-only">{role.name}</span>
    </TooltipProvider>
  );
}
