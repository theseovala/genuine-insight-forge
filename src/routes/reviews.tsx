import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, SlidersHorizontal, Inbox, ChevronDown, Reply, Flag, Share2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  PageHeader,
  Section,
  Stars,
  PlatformIcon,
  StatusBadge,
  EmptyState,
  SentimentDot,
} from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { platforms, locations, type PlatformId } from "@/lib/mock-data";
import { useConnectedPlatforms, useLiveReviews } from "@/lib/repuvala-db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reviews")({
  head: () => ({
    meta: [
      { title: "Review Center — RepuVala™" },
      {
        name: "description",
        content:
          "A unified review inbox for Google, Facebook, Instagram, Trustpilot, Yelp and more, with platform, rating, sentiment and location filters.",
      },
      { property: "og:title", content: "Review Center — RepuVala™" },
      { property: "og:description", content: "Every review from every platform in one inbox." },
    ],
  }),
  component: ReviewCenter,
});

const filterGroups = [
  { key: "status", label: "Status", options: ["All", "Unread", "Pending", "Replied", "Escalated", "Flagged"] },
  { key: "rating", label: "Rating", options: ["All", "5★", "4★", "3★", "2★", "1★"] },
  { key: "sentiment", label: "Sentiment", options: ["All", "Positive", "Neutral", "Negative"] },
  { key: "date", label: "Date", options: ["Last 7 days", "Last 30 days", "Quarter", "Year", "Custom"] },
];

function ReviewCenter() {
  const [platform, setPlatform] = useState<PlatformId | "all">("all");
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loc, setLoc] = useState("all");

  const { data: reviews = [], isLoading } = useLiveReviews();
  const { data: connected = [] } = useConnectedPlatforms();
  const connectedIds = new Set(
    connected.filter((c) => c.status === "connected").map((c) => c.platform),
  );

  const list = useMemo(
    () =>
      reviews.filter((r) => {
        if (platform !== "all" && r.platform !== platform) return false;
        if (status === "Unread" && !r.unread) return false;
        if (["Pending", "Replied", "Escalated", "Flagged"].includes(status) && r.status !== status.toLowerCase())
          return false;
        if (loc !== "all" && r.location !== locations.find((l) => l.id === loc)?.name) return false;
        if (query && !(`${r.author} ${r.body}`.toLowerCase().includes(query.toLowerCase()))) return false;
        return true;
      }),
    [reviews, platform, status, query, loc],
  );


  return (
    <AppShell>
      <PageHeader
        eyebrow="Unified inbox"
        title="Review Center"
        description="Every review from every connected platform, in one place. Filter, triage and open a review to see full context."
        actions={
          <>
            <Button variant="outline"><Share2 /> Export</Button>
            <Button><Reply /> Bulk reply</Button>
          </>
        }
      />

      {/* Filter bar */}
      <div className="card-elevated mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by customer, keyword or phrase…"
              className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <select
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <Button variant="outline" className="lg:w-auto"><SlidersHorizontal /> More filters</Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPlatform("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              platform === "all" ? "border-primary bg-accent text-primary" : "hover:bg-muted",
            )}
          >
            All platforms
          </button>
          {(Object.keys(platforms) as PlatformId[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                platform === p ? "border-primary bg-accent text-primary" : "hover:bg-muted",
                !connectedIds.has(p) && "opacity-50",
              )}
            >
              <PlatformIcon id={p} size="sm" />
              {platforms[p].name}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-4 border-t pt-3">
          {filterGroups.map((g) => (
            <div key={g.key} className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{g.label}:</span>
              <div className="flex flex-wrap gap-1">
                {g.options.map((o) => {
                  const active = g.key === "status" ? status === o : o === g.options[0];
                  return (
                    <button
                      key={o}
                      onClick={() => g.key === "status" && setStatus(o)}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Section
        title={isLoading ? "Loading reviews…" : `${list.length} reviews`}
        description="Click a review to expand full detail and response history"
        bodyClassName="p-0"
      >
        {isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton-shimmer h-16 rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Inbox}
              title="No reviews match these filters"
              description="Try widening the date range, clearing platform filters or searching a different keyword."
              action={<Button variant="outline" onClick={() => { setPlatform("all"); setStatus("All"); setQuery(""); setLoc("all"); }}>Reset filters</Button>}
            />
          </div>
        ) : (
          <ul className="divide-y">
            {list.map((r) => {
              const open = openId === r.id;
              return (
                <li key={r.id} className={cn("transition-colors", r.unread && "bg-accent/30")}>
                  <button
                    onClick={() => setOpenId(open ? null : r.id)}
                    className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-accent/40 md:px-5"
                  >
                    <span className="relative">
                      <span className="grid size-10 place-items-center rounded-full bg-secondary font-display text-xs font-bold text-secondary-foreground">
                        {r.initials}
                      </span>
                      <PlatformIcon id={r.platform} size="sm" className="absolute -bottom-1 -right-1 ring-2 ring-card" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-bold">{r.author}</span>
                        {r.unread && <span className="size-1.5 rounded-full bg-primary" />}
                        <Stars value={r.rating} size={12} />
                        <SentimentDot s={r.sentiment} />
                        <span className="ml-auto flex items-center gap-2">
                          <StatusBadge status={r.status} />
                          <span className="text-[11px] text-muted-foreground">{r.date}</span>
                          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                        </span>
                      </span>
                      {r.title && <span className="mt-1 block text-sm font-semibold">{r.title}</span>}
                      <span className={cn("mt-1 block text-sm text-muted-foreground", !open && "line-clamp-2")}>{r.body}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        {r.tags.map((t) => (
                          <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t}</span>
                        ))}
                        <span className="text-[11px] text-muted-foreground">· {r.location}</span>
                      </span>
                    </span>
                  </button>

                  {open && (
                    <div className="animate-rise border-t bg-muted/30 px-4 py-4 md:px-5">
                      {r.reply ? (
                        <div className="rounded-lg border bg-card p-4">
                          <p className="text-xs font-semibold text-positive">Your published response</p>
                          <p className="mt-1 text-sm">{r.reply}</p>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed bg-card p-4">
                          <p className="text-xs font-semibold text-muted-foreground">No response published yet</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Draft a reply in the Response Center, or use a saved template for this theme.
                          </p>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm"><Reply /> Draft response</Button>
                        <Button size="sm" variant="outline">Assign to teammate</Button>
                        <Button size="sm" variant="outline"><Flag /> Report policy violation</Button>
                        <Button size="sm" variant="ghost">Mark as read</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </AppShell>
  );
}
