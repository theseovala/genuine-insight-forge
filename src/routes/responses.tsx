import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, CheckCircle2, AlertOctagon, Send, Save, Sparkles, Inbox } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  PageHeader,
  Section,
  Stars,
  PlatformIcon,
  StatusBadge,
  StatCard,
  EmptyState,
} from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { useLiveReviews, usePublishReply } from "@/lib/repuvala-db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/responses")({
  head: () => ({
    meta: [
      { title: "Response Center — RepuVala™" },
      {
        name: "description",
        content:
          "Triage pending, high-priority and responded reviews, draft replies with templates and keep response SLAs on track.",
      },
      { property: "og:title", content: "Response Center — RepuVala™" },
      { property: "og:description", content: "A professional workflow for replying to every review." },
    ],
  }),
  component: ResponseCenter,
});

const queues = [
  { id: "priority", label: "High priority", icon: AlertOctagon, tone: "text-negative" },
  { id: "pending", label: "Pending", icon: Clock, tone: "text-warning" },
  { id: "responded", label: "Responded", icon: CheckCircle2, tone: "text-positive" },
] as const;

const templates = [
  "Service recovery — apology + contact",
  "Billing issue — refund follow-up",
  "Thank you — 5★ delighted customer",
  "Wait time — process improvement",
  "Policy review — suspicious content",
];

function ResponseCenter() {
  const [queue, setQueue] = useState<(typeof queues)[number]["id"]>("priority");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const { data: reviews = [], isLoading } = useLiveReviews();
  const publish = usePublishReply();

  const filtered = reviews.filter((r) =>
    queue === "priority"
      ? r.priority === "high" && r.status !== "replied"
      : queue === "pending"
        ? r.status === "pending"
        : r.status === "replied",
  );
  const review = reviews.find((r) => r.id === selected) ?? filtered[0];

  const awaiting = reviews.filter((r) => r.status !== "replied").length;
  const highPriority = reviews.filter((r) => r.priority === "high" && r.status !== "replied").length;
  const responded = reviews.filter((r) => r.status === "replied").length;
  const responseRate = reviews.length ? Math.round((responded / reviews.length) * 100) : 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Action workflow"
        title="Response Center"
        description="Work the queue from most urgent to least. Every response is drafted, reviewed and published from here."
      />

      <div className="stagger mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting response" value={awaiting} sub="Across every connected platform" icon={Clock} tone="rating" />
        <StatCard label="High priority" value={highPriority} sub="1★–2★ or escalated" icon={AlertOctagon} tone="negative" />
        <StatCard label="Responded" value={responded} sub={`${responseRate}% of all reviews`} icon={CheckCircle2} tone="positive" />
        <StatCard label="Total reviews" value={reviews.length} sub="Stored in your workspace" icon={Send} tone="primary" />
      </div>


      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Section bodyClassName="p-0">
          <div className="flex border-b">
            {queues.map((q) => (
              <button
                key={q.id}
                onClick={() => setQueue(q.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 px-2 py-3 text-xs font-semibold transition-colors",
                  queue === q.id
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <q.icon className={cn("size-4", queue === q.id && q.tone)} />
                {q.label}
              </button>
            ))}
          </div>
          {isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton-shimmer h-16 rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Inbox} title="Queue is clear" description="Nothing left in this queue. Great work — check another queue or review analytics." />
            </div>
          ) : (
            <ul className="scrollbar-thin max-h-[560px] divide-y overflow-y-auto">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => { setSelected(r.id); setDraft(""); }}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/40",
                      review?.id === r.id && "bg-accent/60",
                    )}
                  >
                    <PlatformIcon id={r.platform} size="sm" className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.author}</span>
                        <Stars value={r.rating} size={11} />
                        <span className="ml-auto text-[11px] text-muted-foreground">{r.date}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{r.body}</span>
                      <span className="mt-1.5 flex gap-1.5">
                        <StatusBadge status={r.priority} />
                        <StatusBadge status={r.status} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {review ? (
          <Section
            title="Compose response"
            description={`${review.location} · ${review.date}`}
            action={<StatusBadge status={review.priority} />}
          >
            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <PlatformIcon id={review.platform} />
                <div>
                  <p className="text-sm font-bold">{review.author}</p>
                  <Stars value={review.rating} size={12} />
                </div>
                <StatusBadge status={review.status} className="ml-auto" />
              </div>
              <p className="mt-3 text-sm">{review.body}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {review.tags.map((t) => (
                  <span key={t} className="rounded-md bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t}</span>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Suggested templates:</span>
                {templates.slice(0, 3).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDraft(`Hi ${review.author.split(" ")[0]}, thank you for taking the time to share this. ${t.split("—")[1]?.trim() ?? ""} — we're looking into it right away and a manager will contact you personally.`)}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                placeholder="Write a response that acknowledges the issue, takes ownership and offers a clear next step…"
                className="w-full rounded-xl border bg-background p-4 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                Tone check: empathetic, specific, no boilerplate. {draft.length} characters.
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <Button
                disabled={!draft.trim() || publish.isPending}
                onClick={() =>
                  publish.mutate(
                    { id: review.id, reply: draft.trim() },
                    {
                      onSuccess: () => {
                        setDraft("");
                        toast.success("Response published", { description: `Reply saved for ${review.author}.` });
                      },
                      onError: (e) => toast.error("Could not publish", { description: (e as Error).message }),
                    },
                  )
                }
              >
                <Send /> {publish.isPending ? "Publishing…" : "Publish response"}
              </Button>
              <Button variant="outline" onClick={() => toast("Draft saved")}><Save /> Save draft</Button>
              <Button variant="outline">Assign</Button>
              <Button variant="ghost">Escalate to manager</Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              RepuVala never removes genuine feedback. Content that appears to breach platform policy can be
              submitted for review through the reporting workflow.
            </p>
          </Section>
        ) : (
          <Section><EmptyState icon={Inbox} title="Select a review" description="Choose an item from the queue to draft a response." /></Section>
        )}
      </div>
    </AppShell>
  );
}
