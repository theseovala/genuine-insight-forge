import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radar, Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { listScans } from "@/lib/scan.functions";
import { navItems } from "./nav-items";

/**
 * Global command palette. Every entry maps to a real route or a real record —
 * no simulated actions.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const scans = useQuery({ queryKey: ["scans"], queryFn: () => listScans(), enabled: open });
  const recentScans = useMemo(() => (scans.data ?? []).slice(0, 8), [scans.data]);

  function go(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search pages and scans">
      <CommandInput placeholder="Search pages, scans…" />
      <CommandList>
        <CommandEmpty>Nothing matched that search.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem
            value="new scan start website scan"
            onSelect={() => go(() => void navigate({ to: "/scans" }))}
          >
            <Radar /> Start a new website scan
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Pages">
          {navItems.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.id}`}
              onSelect={() => go(() => void navigate({ to: item.to }))}
            >
              <item.icon /> {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {recentScans.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent scans">
              {recentScans.map((scan) => (
                <CommandItem
                  key={scan.id}
                  value={`${scan.target_domain} ${scan.target_url} ${scan.id}`}
                  onSelect={() =>
                    go(() => void navigate({ to: "/scans", search: { scan: scan.id } }))
                  }
                >
                  <Search />
                  <span className="truncate">{scan.target_domain}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {scan.status.replace(/_/g, " ")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Opens the palette on Cmd/Ctrl+K anywhere in the app shell. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
