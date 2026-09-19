import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Activity,
  Clock,
  ScanEye,
  BellOff,
  CheckCheck,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section, StatCard, StatusBadge, EmptyState } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { type Alert } from "@/lib/mock-data";
import { useLiveAlerts, useResolveAlert } from "@/lib/repuvala-db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Reputation Alerts — RepuVala™" },
      {
        name: "description",
        content:
          "Alert center for negative reviews, rating drops, unusual activity, unresolved feedback and suspicious review patterns.",
      },
      { property: "og:title", content: "Reputation Alerts — RepuVala™" },
      { property: "og:description", content: "Know the moment your reputation needs attention." },
    ],
  }),
  component: AlertsPage,
});

const typeMeta: Record<Alert["type"], { icon: typeof ShieldAlert; label: string; tone: string }> = {
  negative: { icon: ShieldAlert, label: "Negative review", tone: "bg-negative-soft text-negative" },
  drop: { icon: TrendingDown, label: "Rating drop", tone: "bg-negative-soft text-negative" },
  spike: { icon: TrendingUp, label: "Reputation spike", tone: "bg-positive-soft text-positive" },
  unusual: { icon: Activity, label: "Unusual activity", tone: "bg-warning-soft text-rating-foreground" },
  unresolved: { icon: Clock, label: "Unresolved feedback", tone: "bg-warning-soft text-rating-foreground" },
  suspicious: { icon: ScanEye, label: "Suspicious activity", tone: "bg-info-soft text-info" },
};

const tabs = ["Unresolved", "All", "Resolved"] as const;

function AlertsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Unresolved");
  const { data: alerts = [], isLoading } = useLiveAlerts();
  const resolve = useResolveAlert();
  const list = alerts.filter((a) => (tab === "All" ? true : tab === "Resolved" ? a.resolved : !a.resolved));

  const open = alerts.filter((a) => !a.resolved);
  const countBy = (s: Alert["severity"]) => open.filter((a) => a.severity === s).length;
  const resolvedCount = alerts.filter((a) => a.resolved).length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Prioritise"
        title="Reputation Alerts"
        description="Every signal that needs a human decision — ranked by impact, with a clear next action on each."
        actions={
          <>
            <Button variant="outline"><BellOff /> Alert rules</Button>
            <Button
              disabled={open.length === 0 || resolve.isPending}
              onClick={() => {
                open.forEach((a) => resolve.mutate({ id: a.id, resolved: true }));
                toast.success(`${open.length} alerts resolved`);
              }}
            >
              <CheckCheck /> Resolve all
            </Button>
          </>
        }
      />

      <div className="stagger mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Critical" value={countBy("critical")} sub="Immediate action" icon={ShieldAlert} tone="negative" />
        <StatCard label="High" value={countBy("high")} sub="Within 4 hours" icon={TrendingDown} tone="rating" />
        <StatCard label="Medium" value={countBy("medium")} sub="Within 24 hours" icon={Clock} tone="default" />
        <StatCard label="Resolved" value={resolvedCount} sub="Closed in this workspace" icon={CheckCheck} tone="positive" />
      </div>


      <div className="mb-4 inline-flex rounded-lg border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Section>
          <EmptyState icon={CheckCheck} title="No alerts here" description="Nothing to review in this view. Your monitoring rules are still watching every connected platform." />
        </Section>
      ) : (
        <div className="stagger grid gap-3">
          {list.map((a) => {
            const meta = typeMeta[a.type];
            return (
              <article
                key={a.id}
                className={cn(
                  "card-elevated card-interactive flex flex-col gap-4 p-5 md:flex-row md:items-center",
                  a.severity === "critical" && "border-l-4 border-l-negative",
                  a.resolved && "opacity-70",
                )}
              >
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", meta.tone)}>
                  <meta.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-bold">{a.title}</h3>
                    <StatusBadge status={a.severity} />
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{meta.label}</span>
                    {a.resolved && <StatusBadge status="Resolved" className="bg-positive-soft text-positive" />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{a.location} · {a.time}</p>
                </div>
                <div className="flex flex-wrap gap-2 md:shrink-0">
                  <Button size="sm" asChild>
                    <Link to={a.type === "drop" || a.type === "spike" ? "/analytics" : "/reviews"}>
                      {a.type === "drop" || a.type === "spike" ? "Analyse" : a.type === "suspicious" ? "Review content" : "Open review"}
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toast("Alert assigned (prototype)")}>Assign</Button>
                  <Button size="sm" variant="ghost" onClick={() => toast.success("Alert resolved (prototype)")}>Resolve</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Section className="mt-5" title="How alerting works" description="Configure thresholds per location, platform and role">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Detect", "Continuous monitoring across every connected platform, location and keyword."],
            ["Rank", "Each signal is scored by rating impact, reviewer reach, recency and unresolved time."],
            ["Route", "Alerts are routed to the right role — location manager, reputation manager or agency staff."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl bg-muted/50 p-4">
              <p className="font-display text-sm font-bold text-primary">{t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </Section>
    </AppShell>
  );
}
