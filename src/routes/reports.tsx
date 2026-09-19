import { createFileRoute } from "@tanstack/react-router";
import { FileText, Download, Mail, CalendarClock, Printer, Share2 } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section, Stars, Trend, ScoreRing, PlatformIcon, SentimentBar } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { ratingTrend, platformPerformance, platforms, locations } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reputation Reports — RepuVala™" },
      {
        name: "description",
        content:
          "Presentation-ready reputation reports: executive summary, platform performance, trends and location comparison.",
      },
      { property: "og:title", content: "Reputation Reports — RepuVala™" },
      { property: "og:description", content: "Board-ready reputation reporting in one click." },
    ],
  }),
  component: ReportsPage,
});

const library = [
  { name: "Monthly Reputation Report", period: "September 2026", type: "Executive", status: "Ready" },
  { name: "Location Comparison Report", period: "Q3 2026", type: "Operations", status: "Ready" },
  { name: "Platform Performance Report", period: "September 2026", type: "Marketing", status: "Ready" },
  { name: "Competitor Benchmark", period: "Q3 2026", type: "Strategy", status: "Scheduled" },
  { name: "Response SLA Report", period: "Week 36", type: "Support", status: "Ready" },
];

function ReportsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Report"
        title="Reports"
        description="Share reputation performance with owners, franchisees and clients — formatted for presentation, not spreadsheets."
        actions={
          <>
            <Button variant="outline"><CalendarClock /> Schedule</Button>
            <Button variant="outline" onClick={() => toast("Preparing print view (prototype)")}><Printer /> Print</Button>
            <Button onClick={() => toast.success("Report export started (prototype)")}><Download /> Export PDF</Button>
          </>
        }
      />

      {/* Report preview sheet */}
      <div className="card-elevated mb-4 overflow-hidden">
        <div className="bg-gradient-hero px-6 py-6 text-primary-foreground md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">Monthly reputation report</p>
              <h2 className="mt-1 font-display text-2xl font-bold">Aroma Ventures — September 2026</h2>
              <p className="mt-1 text-sm text-primary-foreground/80">All locations · 5 connected platforms · Prepared by RepuVala™</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
              <ScoreRing score={84} size={104} stroke={9} label="Score" />
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 md:p-8">
          <section>
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Executive summary</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed">
              Reputation score increased 2.1 points to 84, driven by a record 1,462 new reviews and a
              91% response rate. Average rating reached 4.50★, the highest in seven months. Two
              locations require intervention: Singapore — Orchard (rating fell 0.4★ on wait-time
              complaints) and London — Soho (an escalated billing issue breached SLA). Suspicious
              review activity in New York has been submitted for platform policy review.
            </p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Reputation score", "84", 2.1],
              ["Average rating", "4.50★", 1.8],
              ["New reviews", "1,462", 12.4],
              ["Response rate", "91%", 4.2],
            ].map(([label, value, trend]) => (
              <div key={label as string} className="rounded-xl border bg-muted/40 p-4">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 font-display text-2xl font-bold">{value}</p>
                <Trend value={trend as number} />
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Rating trend</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ratingTrend} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="rep" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis domain={[4, 4.6]} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                    <RTooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                    <Area type="monotone" dataKey="rating" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rep)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section>
              <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Sentiment mix</h3>
              <SentimentBar positive={74} neutral={17} negative={9} className="h-3" />
              <ul className="mt-4 space-y-2 text-sm">
                {[["Positive", "74%", "9,503"], ["Neutral", "17%", "2,183"], ["Negative", "9%", "1,156"]].map(([k, p, n]) => (
                  <li key={k} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <span className="font-medium">{k}</span>
                    <span className="text-muted-foreground">{n} reviews</span>
                    <span className="font-display font-bold">{p}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section>
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Platform performance</h3>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Platform</th>
                    <th className="px-4 py-2.5 font-semibold">Rating</th>
                    <th className="px-4 py-2.5 font-semibold">Reviews</th>
                    <th className="px-4 py-2.5 font-semibold">Response</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {platformPerformance.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5"><span className="flex items-center gap-2 font-medium"><PlatformIcon id={p.id} size="sm" />{platforms[p.id].name}</span></td>
                      <td className="px-4 py-2.5"><span className="flex items-center gap-2"><span className="tabular-nums">{p.rating}</span><Stars value={p.rating} size={10} /></span></td>
                      <td className="px-4 py-2.5 tabular-nums">{p.reviews.toLocaleString()}</td>
                      <td className="px-4 py-2.5 tabular-nums">{p.response}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Location comparison</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {locations.slice(1).map((l) => (
                <div key={l.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{l.name}</p>
                    <Trend value={l.trend} suffix="" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{l.reviews.toLocaleString()} reviews · {l.rating}★ · {l.responseRate}% answered</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${l.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="border-t pt-4 text-xs text-muted-foreground">
            Generated by RepuVala™ · Powered by Software Vala™ — The Name of Trust. Figures in this
            prototype are illustrative.
          </p>
        </div>
      </div>

      <Section title="Report library" description="Saved, scheduled and white-label reports" bodyClassName="p-0">
        <ul className="divide-y">
          {library.map((r) => (
            <li key={r.name} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><FileText className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{r.name}</span>
                <span className="block text-xs text-muted-foreground">{r.period} · {r.type}</span>
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.status === "Ready" ? "bg-positive-soft text-positive" : "bg-info-soft text-info"}`}>{r.status}</span>
              <span className="flex gap-1.5">
                <Button size="sm" variant="outline"><Mail /> Email</Button>
                <Button size="sm" variant="outline"><Share2 /> Share</Button>
                <Button size="sm"><Download /> PDF</Button>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </AppShell>
  );
}
