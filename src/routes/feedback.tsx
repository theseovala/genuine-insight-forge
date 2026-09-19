import { createFileRoute } from "@tanstack/react-router";
import { ThumbsUp, ThumbsDown, Lightbulb, MessageCircleHeart, ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section, StatCard, Trend, SentimentBar } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { feedbackThemes } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: "Customer Feedback — RepuVala™" },
      {
        name: "description",
        content:
          "Recurring themes, praise, complaints and improvement opportunities extracted from every review and survey response.",
      },
      { property: "og:title", content: "Customer Feedback — RepuVala™" },
      { property: "og:description", content: "Turn thousands of comments into a short list of things to fix." },
    ],
  }),
  component: FeedbackPage,
});

const quotes = [
  { text: "The manager personally checked in on us — that's rare these days.", theme: "Staff friendliness", tone: "positive" as const, loc: "Mumbai — Bandra" },
  { text: "Booked online, arrived, and there was no record of it. Third time this year.", theme: "Booking", tone: "negative" as const, loc: "Singapore — Orchard" },
  { text: "Everything was perfect, except the 30-minute wait for the bill.", theme: "Wait time", tone: "neutral" as const, loc: "London — Soho" },
];

function FeedbackPage() {
  const positive = feedbackThemes.filter((t) => t.kind === "positive");
  const negative = feedbackThemes.filter((t) => t.kind === "negative");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Improve"
        title="Customer Feedback"
        description="What customers keep telling you — grouped into themes, ranked by volume and sentiment, so you know what to fix first."
        actions={<Button variant="outline">Create improvement task</Button>}
      />

      <div className="stagger mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Comments analysed" value="12,842" sub="Reviews, comments and surveys" icon={MessageCircleHeart} tone="primary" />
        <StatCard label="Top praise" value="Staff" sub="1,420 mentions · 92% positive" trend={4} icon={ThumbsUp} tone="positive" />
        <StatCard label="Top complaint" value="Wait time" sub="640 mentions · 31% positive" trend={-9} icon={ThumbsDown} tone="negative" />
        <StatCard label="Opportunities" value="3" sub="High volume, low sentiment themes" icon={Lightbulb} tone="rating" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Section title="Recurring themes" description="Every theme, ranked by mention volume" bodyClassName="p-0">
          <ul className="divide-y">
            {feedbackThemes.map((t) => (
              <li key={t.theme} className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.theme}</span>
                    <span className="text-xs text-muted-foreground">{t.mentions.toLocaleString()} mentions</span>
                  </span>
                  <span className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                    t.sentiment >= 70 ? "bg-positive-soft text-positive" : t.sentiment >= 45 ? "bg-warning-soft text-rating-foreground" : "bg-negative-soft text-negative",
                  )}>{t.sentiment}% positive</span>
                  <Trend value={t.change} suffix="pts" />
                </div>
                <SentimentBar className="mt-2 h-1.5" positive={t.sentiment} neutral={Math.round((100 - t.sentiment) * 0.4)} negative={100 - t.sentiment - Math.round((100 - t.sentiment) * 0.4)} />
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-col gap-4">
          <Section title="What customers love" description="Protect and amplify these strengths">
            <ul className="space-y-2.5">
              {positive.map((t) => (
                <li key={t.theme} className="flex items-center gap-3 rounded-lg bg-positive-soft/70 px-3 py-2.5">
                  <ThumbsUp className="size-4 shrink-0 text-positive" />
                  <span className="flex-1 text-sm font-medium">{t.theme}</span>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">{t.mentions}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Improvement opportunities" description="Highest impact fixes, ranked">
            <ul className="space-y-2.5">
              {negative.map((t, i) => (
                <li key={t.theme} className="rounded-lg border border-negative/20 bg-negative-soft/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-md bg-negative text-[11px] font-bold text-destructive-foreground">{i + 1}</span>
                    <span className="flex-1 text-sm font-semibold">{t.theme}</span>
                    <Trend value={t.change} suffix="pts" />
                  </div>
                  <p className="mt-1.5 pl-8 text-xs text-muted-foreground">
                    {t.mentions} mentions · sentiment {t.sentiment}%. Concentrated in Singapore and London.
                  </p>
                  <div className="mt-2 pl-8">
                    <Button size="sm" variant="outline">Assign owner <ArrowUpRight /></Button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <Section title="Voice of the customer" description="Representative quotes behind the themes">
        <div className="grid gap-4 md:grid-cols-3">
          {quotes.map((q) => (
            <figure key={q.text} className={cn(
              "rounded-xl border-l-4 bg-muted/50 p-4",
              q.tone === "positive" ? "border-l-positive" : q.tone === "negative" ? "border-l-negative" : "border-l-neutral",
            )}>
              <blockquote className="text-sm italic">“{q.text}”</blockquote>
              <figcaption className="mt-3 text-xs text-muted-foreground">{q.theme} · {q.loc}</figcaption>
            </figure>
          ))}
        </div>
      </Section>
    </AppShell>
  );
}
