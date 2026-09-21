import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, BookOpen, KeyRound, LifeBuoy, PlugZap, Radar } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section } from "@/components/app/primitives";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "Support & Help — Seovale" },
      {
        name: "description",
        content:
          "Find help with scans, reports, integrations and licensing, and see where to check live system status.",
      },
      { property: "og:title", content: "Support & Help — Seovale" },
      {
        property: "og:description",
        content: "Help topics and live status for your Seovale workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

const topics = [
  {
    to: "/scans" as const,
    icon: Radar,
    title: "Run a website scan",
    body: "Enter a website address and Seovale collects live data, then builds findings, evidence and a CSV export.",
  },
  {
    to: "/settings" as const,
    icon: PlugZap,
    title: "Connect a platform",
    body: "Add keys or sign in to a platform in the integration manager. Each connection is tested against the real provider before it is marked connected.",
  },
  {
    to: "/reports" as const,
    icon: BookOpen,
    title: "Reports and exports",
    body: "Every report and CSV is built from stored scan data only, so numbers always match what was actually collected.",
  },
  {
    to: "/licensing" as const,
    icon: KeyRound,
    title: "Licences and downloads",
    body: "Issue or renew a licence, lock it to a domain, and download a signed package after two-factor confirmation.",
  },
  {
    to: "/system" as const,
    icon: Activity,
    title: "Check live status",
    body: "System health shows the real state of the database, scan engine, queue, AI providers and integrations.",
  },
];

function SupportPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Help"
        title="Support"
        description="Guides for the main workflows, plus where to check what the system is doing right now."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topics.map((topic) => (
          <Link
            key={topic.to}
            to={topic.to}
            className="card-elevated card-interactive surface-sheen flex flex-col gap-2 p-4"
          >
            <span className="icon-tile grid size-9 place-items-center">
              <topic.icon className="size-4" />
            </span>
            <h3 className="font-display text-sm font-bold">{topic.title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{topic.body}</p>
          </Link>
        ))}
      </div>

      <Section
        className="mt-4"
        title="Contact channels"
        description="Phone, WhatsApp and email support are not configured for this workspace yet."
      >
        <div className="flex items-start gap-3">
          <span className="icon-tile grid size-9 shrink-0 place-items-center">
            <LifeBuoy className="size-4" />
          </span>
          <p className="text-sm text-muted-foreground">
            Once you give us the support phone number, WhatsApp number and support inbox you want customers
            to reach, they will appear here as working call, chat and email buttons. Nothing is shown until
            those real details exist.
          </p>
        </div>
      </Section>
    </AppShell>
  );
}
