import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, ChevronRight, Gauge } from "lucide-react";
import { Section, EmptyState } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/seovale-db";
import { getIntegrationHealth } from "@/lib/integrations.functions";

const HEALTH_DOT: Record<string, string> = {
  healthy: "bg-emerald-500",
  unhealthy: "bg-red-500",
};

function healthDot(status: string | null) {
  if (!status) return "bg-muted-foreground/40";
  return HEALTH_DOT[status] ?? "bg-amber-500";
}

/** Real-time per-provider health: last sync, rate limit and 24h error count. Refreshes every 30 seconds. */
export function IntegrationHealthCard() {
  const healthFn = useServerFn(getIntegrationHealth);
  const health = useQuery({
    queryKey: ["integration-health"],
    queryFn: () => healthFn(),
    refetchInterval: 30_000,
  });

  const items = (health.data?.items ?? []).filter(
    (item) => item.status || item.lastSyncAt || item.rateLimit || item.errors24h > 0,
  );
  const unhealthy = items.filter((i) => i.status === "unhealthy").length;
  const totalErrors = items.reduce((sum, i) => sum + i.errors24h, 0);

  return (
    <Section
      className="mb-6"
      title="Integration health"
      description={
        health.isLoading
          ? "Reading live provider telemetry…"
          : `${items.length} providers with activity · ${unhealthy} unhealthy · ${totalErrors} errors in 24h · refreshes every 30s`
      }
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings" search={{ tab: "integrations" }}>
            Manage <ChevronRight />
          </Link>
        </Button>
      }
    >
      {health.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : health.isError ? (
        <EmptyState icon={Activity} title="Health unavailable" description={(health.error as Error).message} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No provider activity yet"
          description="Connect a provider in the Integration Manager and run a test — its real health, sync time, rate limit and errors will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Provider</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Last sync</th>
                <th className="py-2 pr-3 font-semibold">Rate limit</th>
                <th className="py-2 pr-3 font-semibold">Errors (24h)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.provider} className="border-b last:border-0 transition-colors hover:bg-accent/40">
                  <td className="py-2.5 pr-3 font-medium">{item.label}</td>
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`size-2 rounded-full ${healthDot(item.status)}`} />
                      {item.status
                        ? item.status === "healthy"
                          ? "Healthy"
                          : (item.outcomeCode ?? "Unhealthy")
                        : "Not tested"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                    {item.lastSyncAt ? relativeTime(item.lastSyncAt) : "Never synced"}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                    {item.rateLimit ? (
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="size-3" />
                        {item.rateLimit.remaining ?? "?"}/{item.rateLimit.limit ?? "?"} left
                      </span>
                    ) : (
                      "Not provided by API"
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    {item.errors24h > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-destructive" title={item.lastError ?? undefined}>
                        <AlertTriangle className="size-3" />
                        {item.errors24h}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
