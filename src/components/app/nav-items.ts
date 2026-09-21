import {
  LayoutDashboard,
  Inbox,
  MessageSquareReply,
  BarChart3,
  BellRing,
  MapPin,
  ShieldX,
  Swords,
  MessageCircleHeart,
  FileText,
  Settings,
  Radar,
  Activity,
  KeyRound,
  LifeBuoy,
} from "lucide-react";

/** Single source of truth for navigation. Every entry points at a real route. */
export const navItems = [
  { id: "dashboard", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "scans", to: "/scans", label: "Website Scan", icon: Radar },
  { id: "reviews", to: "/reviews", label: "Review Center", icon: Inbox },
  { id: "responses", to: "/responses", label: "Response Center", icon: MessageSquareReply },
  { id: "analytics", to: "/analytics", label: "Analytics", icon: BarChart3 },
  { id: "alerts", to: "/alerts", label: "Alerts", icon: BellRing },
  { id: "removals", to: "/removals", label: "Review Removal", icon: ShieldX },
  { id: "locations", to: "/locations", label: "Locations", icon: MapPin },
  { id: "competitors", to: "/competitors", label: "Competitors", icon: Swords },
  { id: "feedback", to: "/feedback", label: "Customer Feedback", icon: MessageCircleHeart },
  { id: "reports", to: "/reports", label: "Reports", icon: FileText },
  { id: "system", to: "/system", label: "System Health", icon: Activity },
  { id: "licensing", to: "/licensing", label: "Licensing", icon: KeyRound },
  { id: "support", to: "/support", label: "Support", icon: LifeBuoy },
  { id: "settings", to: "/settings", label: "Settings", icon: Settings },
] as const;

export const navGroups = [
  { label: "Overview", ids: ["dashboard", "scans", "analytics"] },
  { label: "Reputation", ids: ["reviews", "responses", "alerts", "removals"] },
  { label: "Growth", ids: ["locations", "competitors", "feedback"] },
  { label: "Workspace", ids: ["reports", "system", "licensing", "support", "settings"] },
] as const;
