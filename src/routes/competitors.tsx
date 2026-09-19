import { createFileRoute } from "@tanstack/react-router";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, Legend } from "recharts";
import { Swords, Info, Plus } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section, Stars, Trend, StatCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { competitors, competitorTrend } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/competitors")({
  head: () => ({
    meta: [
      { title: "Competitor Intelligence — RepuVala™" },
      {
        name: "description",
        content:
          "Benchmark your reputation score, ratings, review volume and sentiment against tracked competitors in your category.",
      },
      { property: "og:title", content: "Competitor Intelligence — RepuVala™" },
      { property: "og:description", content: "See where your brand stands in its category." },
    ],
  }),
  component: CompetitorsPage,
});

function CompetitorsPage() {
  const you = competitors.find((c) => c.you)!;
  const rank = [...competitors].sort((a, b) => b.score - a.score).findIndex((c) => c.you) + 1;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Benchmark"
        title="Competitor Intelligence"
        description="Track how your reputation compares within your category, using publicly visible review signals."
        actions={<Button><Plus /> Track a competitor</Button>}
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-dashed bg-info-soft/60 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p className="text-muted-foreground">
          Competitor figures in this prototype are illustrative. In production RepuVala benchmarks only
          publicly available review data, and never claims access to a competitor&apos;s private systems.
        </p>
      </div>

      <div className="stagger mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Category rank" value={`#${rank} of ${competitors.length}`} sub="By reputation score" icon={Swords} tone="primary" />
        <StatCard label="Your score" value={you.score} sub="Category average 82" trend={you.trend} tone="positive" />
        <StatCard label="Rating gap vs leader" value="-0.1★" sub="Competitor A leads at 4.6★" tone="rating" />
        <StatCard label="Response advantage" value="+17pts" sub="Your 91% vs category 74%" tone="positive" />
      </div>

      <Section className="mb-4" title="Reputation score over time" description="Your brand vs tracked competitors">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={competitorTrend} margin={{ left: -22, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis domain={[70, 95]} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
              <RTooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="you" name="Your brand" stroke="var(--chart-1)" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="a" name="Competitor A" stroke="var(--chart-3)" strokeWidth={2} dot={false} strokeDasharray="5 4" />
              <Line type="monotone" dataKey="b" name="Competitor B" stroke="var(--chart-5)" strokeWidth={2} dot={false} strokeDasharray="5 4" />
              <Line type="monotone" dataKey="c" name="Competitor C" stroke="var(--chart-4)" strokeWidth={2} dot={false} strokeDasharray="5 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Head-to-head" description="Reputation score, rating, volume, sentiment and response rate" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Brand</th>
                <th className="px-5 py-3 font-semibold">Score</th>
                <th className="px-5 py-3 font-semibold">Rating</th>
                <th className="px-5 py-3 font-semibold">Reviews</th>
                <th className="px-5 py-3 font-semibold">Positive sentiment</th>
                <th className="px-5 py-3 font-semibold">Response rate</th>
                <th className="px-5 py-3 font-semibold">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {competitors.map((c) => (
                <tr key={c.name} className={cn("transition-colors hover:bg-accent/40", c.you && "bg-accent/60")}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className={cn("grid size-8 place-items-center rounded-lg font-display text-xs font-bold", c.you ? "bg-gradient-brand text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                        {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </span>
                      {c.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-display font-bold tabular-nums">{c.score}</td>
                  <td className="px-5 py-3"><span className="flex items-center gap-2"><span className="tabular-nums">{c.rating}</span><Stars value={c.rating} size={11} /></span></td>
                  <td className="px-5 py-3 tabular-nums">{c.reviews.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-positive" style={{ width: `${c.sentiment}%` }} />
                      </span>
                      <span className="text-xs font-semibold tabular-nums">{c.sentiment}%</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums">{c.responseRate}%</td>
                  <td className="px-5 py-3"><Trend value={c.trend} suffix="" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          ["Where you win", "Response rate and reply speed — you answer 91% of reviews, the category answers 74%."],
          ["Where you trail", "Review volume. Competitor A collects 43% more reviews, lifting their score despite similar ratings."],
          ["Recommended move", "Run a review-request campaign at Mumbai and Dubai, where sentiment is already strongest."],
        ].map(([t, d]) => (
          <div key={t} className="card-elevated card-interactive p-5">
            <p className="font-display text-sm font-bold text-primary">{t}</p>
            <p className="mt-2 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
