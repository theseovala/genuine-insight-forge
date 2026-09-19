import { createFileRoute } from "@tanstack/react-router";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import { Download, CalendarRange, Gauge, Star, MessagesSquare, Timer } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section, StatCard, Stars, PlatformIcon, Trend } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  ratingTrend,
  sentimentTrend,
  platformPerformance,
  platforms,
  locations,
} from "@/lib/mock-data";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Reputation Analytics — RepuVala™" },
      {
        name: "description",
        content:
          "Rating trends, review volume, sentiment movement, platform and location performance, and response effectiveness.",
      },
      { property: "og:title", content: "Reputation Analytics — RepuVala™" },
      { property: "og:description", content: "Understand what is moving your reputation, and why." },
    ],
  }),
  component: Analytics,
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

const responsePerf = [
  { day: "Mon", replies: 42, hours: 3.8 },
  { day: "Tue", replies: 51, hours: 3.2 },
  { day: "Wed", replies: 39, hours: 4.1 },
  { day: "Thu", replies: 58, hours: 2.9 },
  { day: "Fri", replies: 64, hours: 2.6 },
  { day: "Sat", replies: 31, hours: 5.4 },
  { day: "Sun", replies: 24, hours: 6.1 },
];

function Analytics() {
  const radar = locations.slice(1).map((l) => ({ location: l.city, score: l.score }));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Understand"
        title="Reputation Analytics"
        description="Where your reputation is heading, which platforms and locations drive it, and how response performance affects the outcome."
        actions={
          <>
            <Button variant="outline"><CalendarRange /> Last 6 months</Button>
            <Button variant="outline"><Download /> Export data</Button>
          </>
        }
      />

      <div className="stagger mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reputation score" value="84" sub="Composite of rating, volume, sentiment & response" trend={2.1} icon={Gauge} tone="primary" />
        <StatCard label="Average rating" value="4.50" sub="From 4.28 six months ago" trend={5.1} icon={Star} tone="rating" />
        <StatCard label="Review velocity" value="1,462/mo" sub="Highest ever recorded" trend={12.4} icon={MessagesSquare} tone="positive" />
        <StatCard label="Avg response time" value="3h 12m" sub="Faster is better" trend={-12} icon={Timer} tone="default" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Section className="lg:col-span-2" title="Reputation score & rating trend" description="Composite score vs average rating">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ratingTrend} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="aScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" domain={[70, 90]} />
                <RTooltip {...chartTip} />
                <Area type="monotone" dataKey="score" name="Reputation score" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#aScore)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Review volume" description="Monthly reviews collected">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratingTrend} margin={{ left: -22, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <RTooltip {...chartTip} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="reviews" name="Reviews" fill="var(--chart-2)" radius={[6, 6, 0, 0]} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Section title="Sentiment trend" description="Share of positive, neutral and negative reviews per week">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sentimentTrend} stackOffset="expand" margin={{ left: -22, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis hide />
                <RTooltip {...chartTip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="positive" stackId="1" stroke="var(--positive)" fill="var(--positive)" fillOpacity={0.75} />
                <Area type="monotone" dataKey="neutral" stackId="1" stroke="var(--neutral)" fill="var(--neutral)" fillOpacity={0.6} />
                <Area type="monotone" dataKey="negative" stackId="1" stroke="var(--negative)" fill="var(--negative)" fillOpacity={0.7} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Response performance" description="Replies published vs average response time">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={responsePerf} margin={{ left: -22, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis yAxisId="l" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <RTooltip {...chartTip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="l" type="monotone" dataKey="replies" name="Replies" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="hours" name="Avg hours" stroke="var(--chart-3)" strokeWidth={2.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section className="lg:col-span-2" title="Platform performance" description="Rating, volume, response rate and share of voice" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Platform</th>
                  <th className="px-5 py-3 font-semibold">Rating</th>
                  <th className="px-5 py-3 font-semibold">Reviews</th>
                  <th className="px-5 py-3 font-semibold">Response rate</th>
                  <th className="px-5 py-3 font-semibold">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {platformPerformance.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-semibold">
                        <PlatformIcon id={p.id} size="sm" /> {platforms[p.id].name}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2"><span className="font-semibold tabular-nums">{p.rating}</span><Stars value={p.rating} size={11} /></span>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{p.reviews.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${p.response}%` }} />
                        </span>
                        <span className="text-xs font-semibold tabular-nums">{p.response}%</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{p.share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Location performance" description="Reputation score by branch">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="location" fontSize={11} stroke="var(--muted-foreground)" />
                <Radar dataKey="score" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.35} animationDuration={900} />
                <RTooltip {...chartTip} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2 border-t pt-3">
            {locations.slice(1, 4).map((l) => (
              <div key={l.id} className="flex items-center justify-between text-xs">
                <span className="font-medium">{l.name}</span>
                <Trend value={l.trend} suffix="" />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
