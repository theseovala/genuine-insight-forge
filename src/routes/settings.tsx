import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Plug,
  Bell,
  Users,
  ShieldCheck,
  MapPin,
  Palette,
  CreditCard,
  Plus,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section, PlatformIcon, StatusBadge, BrandMark } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { platforms, teamMembers, roles, locations, type PlatformId } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RepuVala™" },
      {
        name: "description",
        content:
          "Business profile, connected review platforms, notifications, team roles, locations, branding and account settings.",
      },
      { property: "og:title", content: "Settings — RepuVala™" },
      { property: "og:description", content: "Configure your reputation command center." },
    ],
  }),
  component: SettingsPage,
});

const tabs = [
  { id: "business", label: "Business profile", icon: Building2 },
  { id: "platforms", label: "Connected platforms", icon: Plug },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "team", label: "Team", icon: Users },
  { id: "roles", label: "Roles & permissions", icon: ShieldCheck },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "account", label: "Account & billing", icon: CreditCard },
] as const;

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        defaultValue={value}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Toggle({ title, description, defaultOn = true }: { title: string; description: string; defaultOn?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3.5 last:border-0">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch defaultChecked={defaultOn} />
    </div>
  );
}

function SettingsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("business");

  return (
    <AppShell>
      <PageHeader eyebrow="Configure" title="Settings" description="Set up the business, platforms, people and rules that power RepuVala." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <nav className="card-elevated h-fit p-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                tab === t.id ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          {tab === "business" && (
            <Section title="Business profile" description="How your organization appears across RepuVala">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business name" value="Aroma Ventures" />
                <Field label="Industry" value="Hospitality & Retail" />
                <Field label="Website" value="https://aromaventures.example" />
                <Field label="Support email" value="care@aromaventures.example" />
                <Field label="Headquarters" value="Mumbai, India" />
                <Field label="Time zone" value="(GMT+5:30) India Standard Time" />
              </div>
              <div className="mt-5 flex gap-2 border-t pt-4">
                <Button>Save changes</Button>
                <Button variant="ghost">Cancel</Button>
              </div>
            </Section>
          )}

          {tab === "platforms" && (
            <Section title="Connected platforms" description="Connect a platform to start monitoring reviews and comments" bodyClassName="p-0">
              <ul className="divide-y">
                {(Object.keys(platforms) as PlatformId[]).map((p) => (
                  <li key={p} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <PlatformIcon id={p} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{platforms[p].name}</p>
                      <p className="text-xs text-muted-foreground">
                        {platforms[p].connected ? "Syncing every 15 minutes · 6 locations mapped" : "Not connected — reviews from this platform are not monitored"}
                      </p>
                    </div>
                    <StatusBadge status={platforms[p].connected ? "Connected" : "Disconnected"} />
                    <Button size="sm" variant={platforms[p].connected ? "outline" : "default"}>
                      {platforms[p].connected ? "Manage" : "Connect"}
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {tab === "notifications" && (
            <>
              <Section title="Alert notifications" description="Choose what RepuVala tells you about, and how">
                <Toggle title="New negative review (1★–2★)" description="Instant push and email to the location manager." />
                <Toggle title="Rating drop threshold" description="Notify when a location falls more than 0.3★ in 7 days." />
                <Toggle title="Suspicious review activity" description="Detect bursts of similar reviews from new accounts." />
                <Toggle title="Unresolved feedback SLA" description="Escalate when a high-priority review is unanswered for 24 hours." />
                <Toggle title="Positive spikes" description="Celebrate and amplify surges of positive sentiment." defaultOn={false} />
                <Toggle title="Weekly digest" description="Monday summary of score, volume and open items." />
              </Section>
              <Section title="Delivery channels">
                <div className="grid gap-3 sm:grid-cols-3">
                  {["Email", "In-app", "Mobile push"].map((c) => (
                    <div key={c} className="flex items-center justify-between rounded-xl border p-4">
                      <span className="text-sm font-semibold">{c}</span>
                      <Switch defaultChecked />
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {tab === "team" && (
            <Section
              title="Team members"
              description="People with access to this workspace"
              action={<Button size="sm"><Plus /> Invite</Button>}
              bodyClassName="p-0"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3 font-semibold">Member</th>
                      <th className="px-5 py-3 font-semibold">Role</th>
                      <th className="px-5 py-3 font-semibold">Scope</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {teamMembers.map((m) => (
                      <tr key={m.email} className="transition-colors hover:bg-accent/40">
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-2.5">
                            <span className="grid size-8 place-items-center rounded-full bg-secondary text-[11px] font-bold">
                              {m.name.split(" ").map((w) => w[0]).join("")}
                            </span>
                            <span>
                              <span className="block font-semibold">{m.name}</span>
                              <span className="block text-xs text-muted-foreground">{m.email}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-5 py-3">{m.role}</td>
                        <td className="px-5 py-3 text-muted-foreground">{m.locations}</td>
                        <td className="px-5 py-3"><StatusBadge status={m.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {tab === "roles" && (
            <Section title="Roles & permissions" description="Ten role experiences, each with a permission-aware navigation concept" bodyClassName="p-0">
              <ul className="divide-y">
                {roles.map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldCheck className="size-4 text-primary" />
                      <span className="text-sm font-bold">{r.name}</span>
                      <StatusBadge status={r.scope} className="bg-accent text-primary" />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold">Dashboard focus:</span> {r.focus}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(r.nav.includes("all") ? ["Full platform access"] : r.nav).map((n) => (
                        <span key={n} className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                          <Check className="size-3 text-positive" /> {n}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {tab === "locations" && (
            <Section title="Locations" description="Branches monitored in this workspace" action={<Button size="sm"><Plus /> Add</Button>} bodyClassName="p-0">
              <ul className="divide-y">
                {locations.slice(1).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="grid size-9 place-items-center rounded-lg bg-accent text-primary"><MapPin className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{l.name}</span>
                      <span className="block text-xs text-muted-foreground">{l.city}, {l.country} · Manager: {l.manager}</span>
                    </span>
                    <StatusBadge status="Active" />
                    <Button size="sm" variant="outline">Edit</Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {tab === "branding" && (
            <Section title="Branding" description="White-label the dashboard and reports for your brand or agency clients">
              <div className="flex flex-wrap items-center gap-4 rounded-xl border p-5">
                <BrandMark size="lg" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Workspace logo</p>
                  <p className="text-xs text-muted-foreground">PNG or SVG, at least 256×256px.</p>
                </div>
                <Button variant="outline">Upload</Button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Brand accent colour" value="#1F6F86" hint="Used in reports and client portals." />
                <Field label="Report footer" value="Prepared by Aroma Ventures — Powered by Software Vala™" />
              </div>
              <div className="mt-4 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                Agency plans can replace RepuVala branding on client-facing reports while keeping the
                “Powered by Software Vala™” trust mark in the product footer.
              </div>
            </Section>
          )}

          {tab === "account" && (
            <>
              <Section title="Plan" description="Current subscription">
                <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-muted/40 p-5">
                  <div className="flex-1">
                    <p className="font-display text-lg font-bold">Enterprise — Multi-location</p>
                    <p className="text-sm text-muted-foreground">6 locations · unlimited users · white-label reports</p>
                  </div>
                  <StatusBadge status="Active" />
                  <Button variant="outline">Manage plan</Button>
                </div>
              </Section>
              <Section title="Security">
                <Toggle title="Two-factor authentication" description="Required for admin and owner roles." />
                <Toggle title="Single sign-on (SSO)" description="SAML 2.0 for enterprise workspaces." defaultOn={false} />
                <Toggle title="Audit log" description="Record every response, export and permission change." />
              </Section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
