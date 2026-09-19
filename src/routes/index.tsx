import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Star,
  MessagesSquare,
  Timer,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { AppShell } from "@/components/app/AppShell";
import {
  PageHeader,
  StatCard,
  ScoreRing,
  Section,
  Stars,
  SentimentBar,
  PlatformIcon,
  StatusBadge,
  Trend,
  SentimentDot,
} from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  alerts,
  platformPerformance,
  platforms,
  ratingTrend,
  reviews,
  activity,
  locations,
  ratingDistribution,
} from "@/lib/mock-data";
import { useApp } from "@/lib/app-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reputation Dashboard — RepuVala™" },
      {
        name: "description",
        content:
          "Executive reputation overview: score, ratings, sentiment, alerts and platform performance in one command center.",
      },
      { property: "og:title", content: "Reputation Dashboard — RepuVala™" },
      {
        property: "og:description",
        content: "See how your reputation is today, what needs attention, and what to do next.",
      },
    ],
  }),
  component: Dashboard,
});

const chartTip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    fontSize: "12px",
    boxShadow: "var(--shadow-card)",
  },
};

function Dashboard() {
  const { role, location } = useApp();
  const openAlerts = alerts.filter((a) => !a.resolved);
  const pending = reviews.filter((r) => r.status === "pending");

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${role.name} view · ${location.name}`}
        title="How is your reputation today?"
        description={role.focus}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/reports">View reports</Link>
            </Button>
            <Button asChild>
              <Link to="/responses">
                Respond to {pending.length} pending <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      {/* Hero score panel */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="card-elevated bg-gradient-hero p-6 text-primary-foreground md:p-8">
          <div className="flex flex-col items-center gap-7 md:flex-row md:items-center">
            <div className="rounded-full bg-white/5 p-2 backdrop-blur">
              <ScoreRing score={84} />
            </div>
            <div className="min-w-0 flex-1 text-center md:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
                Reputation health · last 30 days
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold md:text-3xl">Strong and improving</h2>
              <p className="mt-2 max-w-lg text-sm text-primary-foreground/80">
                Your score rose 2.1 points this month. Two locations need attention: Singapore
                (rating drop) and London (unanswered escalation).
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
                <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold backdrop-blur">
                  12,842 reviews tracked
                </span>
                <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold backdrop-blur">
                  5 platforms connected
                </span>
                <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold backdrop-blur">
                  6 locations
                </span>
              </div>
            </div>
          </div>
        </div>

        <Section
          title="What needs your attention"
          description="Highest-impact items right now"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/alerts">All alerts <ChevronRight /></Link>
            </Button>
          }
          bodyClassName="p-0"
        >
          <ul className="divide-y">
            {openAlerts.slice(0, 4).map((a) => (
              <li key={a.id}>
                <Link to="/alerts" className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-accent/50">
                  <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-negative-soft text-negative">
                    <ShieldAlert className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{a.title}</span>
                      <StatusBadge status={a.severity} />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {a.location} · {a.time}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* KPI row */}
      <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Average rating" value="4.5" sub="Across all platforms" trend={1.8} icon={Star} tone="rating">
          <Stars value={4.5} className="mt-3" />
        </StatCard>
        <StatCard label="Total reviews" value="12,842" sub="+1,462 this month" trend={12.4} icon={MessagesSquare} tone="primary" />
        <StatCard label="Response rate" value="91%" sub="Median reply time 3h 12m" trend={4.2} icon={Timer} tone="positive" />
        <StatCard label="Open alerts" value={openAlerts.length} sub="3 high priority" trend={-16} icon={ShieldAlert} tone="negative" />
      </div>

      {/* Charts */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Section
          className="lg:col-span-2"
          title="Rating & review volume trend"
          description="7-month movement across all connected platforms"
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ratingTrend} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gRating" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis domain={[4, 4.6]} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <RTooltip {...chartTip} />
                <Area type="monotone" dataKey="rating" stroke="var(--chart-2)" strokeWidth={2.5} fill="url(#gRating)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Sentiment overview" description="Last 30 days">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold">74%</span>
            <span className="text-sm text-muted-foreground">positive</span>
            <Trend value={3.1} className="ml-auto" />
          </div>
          <SentimentBar positive={74} neutral={17} negative={9} className="mt-4 h-3" />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["positive", "74%", "9,503"],
              ["neutral", "17%", "2,183"],
              ["negative", "9%", "1,156"],
            ].map(([s, pct, n]) => (
              <div key={s} className="rounded-lg bg-muted/60 px-2 py-3">
                <SentimentDot s={s as "positive"} />
                <p className="mt-1 font-display text-base font-bold">{pct}</p>
                <p className="text-[11px] text-muted-foreground">{n} reviews</p>
              </div>
            ))}
          </div>
          <div className="mt-5 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratingDistribution} layout="vertical" margin={{ left: -22 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="stars" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v) => `${v}★`} />
                <RTooltip {...chartTip} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="count" fill="var(--chart-3)" radius={[0, 6, 6, 0]} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      {/* Platform + recent + activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Platform performance" bodyClassName="p-0">
          <ul className="divide-y">
            {platformPerformance.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <PlatformIcon id={p.id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{platforms[p.id].name}</p>
                  <p className="text-xs text-muted-foreground">{p.reviews.toLocaleString()} reviews · {p.response}% answered</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-sm font-bold">{p.rating}</p>
                  <Stars value={p.rating} size={10} />
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Recent reviews"
          action={<Button variant="ghost" size="sm" asChild><Link to="/reviews">Open inbox <ChevronRight /></Link></Button>}
          bodyClassName="p-0"
        >
          <ul className="divide-y">
            {reviews.slice(0, 4).map((r) => (
              <li key={r.id}>
                <Link to="/reviews" className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-accent/50">
                  <PlatformIcon id={r.platform} size="sm" className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{r.author}</span>
                      <Stars value={r.rating} size={11} />
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{r.body}</span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      <span className="text-[11px] text-muted-foreground">{r.date}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-col gap-4">
          <Section title="Location snapshot" bodyClassName="p-0">
            <ul className="divide-y">
              {locations.slice(1, 5).map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent font-display text-xs font-bold text-primary">
                    {l.score}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.reviews.toLocaleString()} reviews</p>
                  </div>
                  <Trend value={l.trend} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Team activity" bodyClassName="p-0">
            <ul className="divide-y">
              {activity.slice(0, 4).map((a, i) => (
                <li key={i} className="px-5 py-3 text-xs">
                  <span className="font-semibold text-foreground">{a.who}</span>{" "}
                  <span className="text-muted-foreground">{a.what}</span>{" "}
                  <span className="font-medium">{a.target}</span>
                  <span className="block text-[11px] text-muted-foreground">{a.time}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <div className="mt-6 card-elevated flex flex-col items-start gap-4 p-6 md:flex-row md:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
          <Sparkles className="size-5" />
        </span>
        <div className="flex-1">
          <h3 className="font-display text-base font-bold">What should you do next?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow the RepuVala journey: Dashboard → Alert → Review → Analysis → Action → Report.
            Start with the Singapore rating drop, then clear the response queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to="/analytics">Analyse trend</Link></Button>
          <Button asChild><Link to="/alerts">Start with alerts <ArrowRight /></Link></Button>
        </div>
      </div>
    </AppShell>
  );
}
