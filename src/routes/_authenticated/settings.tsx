import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Plug,
  Bell,
  MapPin,
  CreditCard,
  Loader2,
  ExternalLink,
  RefreshCw,
  Boxes,
  ShieldCheck,
} from "lucide-react";
import { IntegrationManager } from "@/components/app/IntegrationManager";
import { integrationById } from "@/lib/integrations/registry";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section, PlatformIcon, StatusBadge, EmptyState } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  useBrandSettings,
  useUpdateBrandSettings,
  useProfile,
  useUpdateProfile,
  useConnectedPlatforms,
  useDisconnectPlatform,
  useLocations,
  relativeTime,
  type BrandSettings,
} from "@/lib/seovale-db";
import { platformName } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { disconnectGoogleBusiness, getGoogleBusinessConnection, startGoogleBusinessConnection, syncGoogleBusinessReviews } from "@/lib/google-business.functions";
import { useGoogleDisclosure } from "@/components/legal/GoogleDisclosureDialog";
import { PrivacyDataPanel } from "@/components/legal/PrivacyDataPanel";
import { GOOGLE_BUSINESS_SCOPES, GOOGLE_DISCLOSURE_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Seovale" },
      {
        name: "description",
        content:
          "Business profile, connected review platforms, notification preferences, locations and account settings.",
      },
      { property: "og:title", content: "Settings — Seovale" },
      { property: "og:description", content: "Configure your reputation command center." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const tabs = [
  { id: "business", label: "Business profile", icon: Building2 },
  { id: "platforms", label: "Connected platforms", icon: Plug },
  { id: "integrations", label: "Integration manager", icon: Boxes },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "account", label: "Account", icon: CreditCard },
  { id: "privacy", label: "Privacy & data", icon: ShieldCheck },
] as const;

/**
 * A labelled text field. Omitting `onChange` marks the value as one the account
 * owner cannot edit here, and the input is rendered read-only so it cannot
 * accept typing it would then discard.
 */
function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  hint?: string;
}) {
  const readOnly = !onChange;
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        aria-readonly={readOnly}
        className={cn(
          "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40",
          readOnly && "cursor-default bg-muted/50 text-muted-foreground focus:ring-0",
        )}
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3.5 last:border-0">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SettingsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("business");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && tabs.some((t) => t.id === requested)) setTab(requested as (typeof tabs)[number]["id"]);
  }, []);

  return (
    <AppShell>
      <PageHeader eyebrow="Configure" title="Settings" description="Set up the business, platforms and rules that power Seovale." />

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
          {tab === "business" && <BusinessProfileTab />}
          {tab === "platforms" && <PlatformsTab onOpenIntegrations={() => setTab("integrations")} />}
          {tab === "integrations" && <IntegrationManager />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "locations" && <LocationsTab />}
          {tab === "account" && <AccountTab />}
          {tab === "privacy" && <PrivacyDataPanel />}
        </div>
      </div>
    </AppShell>
  );
}

function BusinessProfileTab() {
  const { data: brand, isLoading } = useBrandSettings();
  const update = useUpdateBrandSettings();
  const [form, setForm] = useState<Partial<BrandSettings>>({});

  useEffect(() => {
    if (brand) setForm(brand);
  }, [brand]);

  if (isLoading) {
    return (
      <Section title="Business profile">
        <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      </Section>
    );
  }

  if (!brand) {
    return (
      <Section title="Business profile">
        <EmptyState icon={Building2} title="No brand profile found" description="Your workspace has not been set up with brand settings yet." />
      </Section>
    );
  }

  const set = <K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    // Only the fields this form edits are sent. The loaded row also carries
    // id / workspace_id and the notification toggles, which must not be
    // written back from here.
    const patch: Partial<BrandSettings> = {};
    if (form.brand_name !== undefined) patch.brand_name = form.brand_name;
    if (form.industry !== undefined) patch.industry = form.industry;
    if (form.website !== undefined) patch.website = form.website;
    if (form.reply_tone !== undefined) patch.reply_tone = form.reply_tone;
    if (form.reply_signature !== undefined) patch.reply_signature = form.reply_signature;
    if (form.alert_email !== undefined) patch.alert_email = form.alert_email;
    update.mutate(
      { id: brand.id, patch },
      {
        onSuccess: () => toast.success("Business profile updated"),
        onError: (err) => toast.error(err.message || "Could not save changes"),
      },
    );
  };

  return (
    <Section title="Business profile" description="How your organization appears across Seovale">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" value={form.brand_name ?? ""} onChange={(v) => set("brand_name", v)} />
        <Field label="Industry" value={form.industry ?? ""} onChange={(v) => set("industry", v)} />
        <Field label="Website" value={form.website ?? ""} onChange={(v) => set("website", v)} />
        <Field label="Reply tone" value={form.reply_tone ?? ""} onChange={(v) => set("reply_tone", v)} hint="Used when drafting AI replies to reviews." />
        <Field label="Reply signature" value={form.reply_signature ?? ""} onChange={(v) => set("reply_signature", v)} />
        <Field label="Alert email" value={form.alert_email ?? ""} onChange={(v) => set("alert_email", v)} hint="Saved for when email delivery is connected — no emails are sent yet." />
      </div>
      <div className="mt-5 flex gap-2 border-t pt-4">
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending && <Loader2 className="animate-spin" />} Save changes
        </Button>
        <Button variant="ghost" onClick={() => setForm(brand)}>Cancel</Button>
      </div>
    </Section>
  );
}

function PlatformsTab({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const { data: platformsList, isLoading } = useConnectedPlatforms();
  // Non-Google platforms are connected through the Integration manager, which
  // runs the real OAuth / API-key flow. Send the user there instead of a toast
  // that does nothing.
  const openInIntegrationManager = (platform: string, label: string) => {
    if (integrationById(platform)) {
      toast.message(`Connect ${label} from the Integration manager`);
    } else {
      toast.message(`${label} has no self-serve connection in the Integration manager yet`);
    }
    onOpenIntegrations();
  };
  const disconnect = useDisconnectPlatform();
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getGoogleBusinessConnection);
  const startFn = useServerFn(startGoogleBusinessConnection);
  const syncFn = useServerFn(syncGoogleBusinessReviews);
  const disconnectGoogleFn = useServerFn(disconnectGoogleBusiness);
  const google = useQuery({ queryKey: ["google_business_connection"], queryFn: () => statusFn() });
  const disclosure = useGoogleDisclosure();
  const connectGoogle = useMutation({
    mutationFn: ({ authWindow }: { authWindow: Window | null }) =>
      startFn({ data: { origin: window.location.origin, disclosureVersion: GOOGLE_DISCLOSURE_VERSION } }).then((result) => ({ ...result, authWindow })),
    onSuccess: ({ authorizationUrl, authWindow }) => {
      // Sandboxed preview iframes may silently block navigating a pre-opened
      // popup (no exception — the popup just stays on about:blank). Try the
      // popup first, then verify it actually left about:blank; if not, fall
      // back to a fresh popup and finally to a full-tab redirect.
      const assignFallback = () => {
        // No "noopener" feature: with it window.open always returns null, so
        // this tab was navigated away every time. Sever the opener by hand.
        const popup = window.open(authorizationUrl, "_blank");
        if (popup) popup.opener = null;
        else window.location.assign(authorizationUrl);
      };
      if (authWindow && !authWindow.closed) {
        try {
          authWindow.opener = null;
          authWindow.location.href = authorizationUrl;
        } catch {
          authWindow.close();
          assignFallback();
          return;
        }
        window.setTimeout(() => {
          let stuck = true;
          try {
            // Reading cross-origin location throws once the popup has
            // actually navigated to Google — that means success.
            stuck = authWindow.closed ? false : authWindow.location.href === "about:blank";
          } catch {
            stuck = false;
          }
          if (stuck) {
            try { authWindow.close(); } catch { /* ignore */ }
            assignFallback();
          }
        }, 1500);
        return;
      }
      assignFallback();
    },
    onError: (error: Error, { authWindow }) => {
      authWindow?.close();
      toast.error(error.message);
    },
  });
  const syncGoogle = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (result) => {
      toast.success(`Google synced: ${result.reviewsCreated} new, ${result.reviewsUpdated} updated`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeGoogle = useMutation({
    mutationFn: () => disconnectGoogleFn(),
    onSuccess: () => {
      toast.success("Google Business Profile disconnected");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <Section title="Connected platforms">
        <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      </Section>
    );
  }

  if (!platformsList || platformsList.length === 0) {
    return (
      <Section title="Connected platforms">
        <EmptyState icon={Plug} title="No platforms configured" description="Platforms your workspace can connect to will appear here." />
      </Section>
    );
  }

  return (
    <Section title="Connected platforms" description="Connect a platform to start monitoring reviews and comments" bodyClassName="p-0">
      <ul className="divide-y">
        {platformsList.map((p) => {
          const isGoogle = p.platform === "google";
          const connected = isGoogle ? Boolean(google.data?.connected) : p.status === "connected";
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <PlatformIcon id={p.platform as never} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{p.display_name || platformName(p.platform)}</p>
                <p className="text-xs text-muted-foreground">
                  {connected
                    ? `Last synced ${(isGoogle ? google.data?.lastSyncedAt : p.last_synced_at) ? relativeTime((isGoogle ? google.data?.lastSyncedAt : p.last_synced_at) as string) : "never"}${(isGoogle ? google.data?.email : p.account_ref) ? ` · ${isGoogle ? google.data?.email : p.account_ref}` : ""}`
                    : p.last_sync_error
                      ? `Not connected — ${p.last_sync_error}`
                      : "Not connected — reviews from this platform are not monitored"}
                </p>
              </div>
              <StatusBadge status={connected ? "Connected" : "Disconnected"} />
              {connected ? (
                <>
                  {isGoogle && <Button size="sm" onClick={() => syncGoogle.mutate()} disabled={syncGoogle.isPending}>{syncGoogle.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync now</Button>}
                  <Button size="sm" variant="outline" onClick={() => isGoogle ? removeGoogle.mutate() : disconnect.mutate(p.id, { onSuccess: () => toast.success(`${p.display_name} disconnected`), onError: (err) => toast.error(err.message || "Could not disconnect") })} disabled={disconnect.isPending || removeGoogle.isPending}>Disconnect</Button>
                </>
              ) : p.supports_oauth ? (
                <Button
                  size="sm"
                  disabled={isGoogle && (!google.data?.configured || connectGoogle.isPending)}
                  onClick={() => {
                    if (!isGoogle) {
                      openInIntegrationManager(p.platform, p.display_name || platformName(p.platform));
                      return;
                    }
                    // The data-access disclosure comes first; its Continue click is
                    // the user gesture that opens the Google window.
                    disclosure.request({
                      label: "Google Business Profile",
                      scopes: GOOGLE_BUSINESS_SCOPES,
                      businessProfile: true,
                      run: () => {
                        const authWindow = window.open("about:blank", "seovale-google-business");
                        if (authWindow) {
                          authWindow.document.title = "Connecting Google Business Profile…";
                          authWindow.document.body.textContent = "Opening Google securely…";
                        }
                        connectGoogle.mutate({ authWindow });
                      },
                    });
                  }}
                >
                  {connectGoogle.isPending && isGoogle && <Loader2 className="animate-spin" />}Connect
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openInIntegrationManager(p.platform, p.display_name || platformName(p.platform))}
                >
                  <ExternalLink /> Connection request
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {disclosure.dialog}
    </Section>
  );
}

function NotificationsTab() {
  const { data: brand, isLoading } = useBrandSettings();
  const update = useUpdateBrandSettings();

  if (isLoading) {
    return (
      <Section title="Alert notifications">
        <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      </Section>
    );
  }

  if (!brand) {
    return (
      <Section title="Alert notifications">
        <EmptyState icon={Bell} title="No brand profile found" description="Notification preferences require a brand profile." />
      </Section>
    );
  }

  return (
    <Section title="Alert notifications" description="Choose what Seovale tells you about">
      <Toggle
        title="New negative review alerts"
        description="Notify when a 1–2 star review comes in."
        checked={brand.negative_review_alerts}
        onChange={(v) =>
          update.mutate(
            { id: brand.id, patch: { negative_review_alerts: v } },
            { onError: (err) => toast.error(err.message || "Could not update") },
          )
        }
      />
      <Toggle
        title="Weekly digest"
        description="Monday summary of score, volume and open items."
        checked={brand.weekly_digest}
        onChange={(v) =>
          update.mutate(
            { id: brand.id, patch: { weekly_digest: v } },
            { onError: (err) => toast.error(err.message || "Could not update") },
          )
        }
      />
      <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Email delivery is not connected yet (no email provider such as Resend is set up to send), so these preferences are
          saved but no notification emails are sent. New alerts still appear on the Alerts page.
        </span>
      </div>
    </Section>
  );
}

function LocationsTab() {
  const { data: locations, isLoading } = useLocations();

  if (isLoading) {
    return (
      <Section title="Locations">
        <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      </Section>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <Section title="Locations">
        <EmptyState icon={MapPin} title="No locations yet" description="Locations added to this workspace will appear here." />
      </Section>
    );
  }

  return (
    <Section title="Locations" description="Branches monitored in this workspace" bodyClassName="p-0">
      <ul className="divide-y">
        {locations.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className="grid size-9 place-items-center rounded-lg bg-accent text-primary"><MapPin className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{l.name}</span>
              <span className="block text-xs text-muted-foreground">{l.city}, {l.country} · Manager: {l.manager ?? "Unassigned"}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function AccountTab() {
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setJobTitle(profile.job_title ?? "");
    }
  }, [profile]);

  if (isLoading) {
    return (
      <Section title="Account">
        <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      </Section>
    );
  }

  if (!profile) {
    return (
      <Section title="Account">
        <EmptyState icon={CreditCard} title="Not signed in" description="Sign in to manage your account." />
      </Section>
    );
  }

  return (
    <Section title="Account" description="Your profile details">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" value={fullName} onChange={setFullName} />
        <Field label="Job title" value={jobTitle} onChange={setJobTitle} />
        <Field label="Email" value={profile.email ?? ""} hint="Managed by your login provider." />
      </div>
      <div className="mt-5 flex gap-2 border-t pt-4">
        <Button
          onClick={() =>
            update.mutate(
              { full_name: fullName, job_title: jobTitle },
              {
                onSuccess: () => toast.success("Account updated"),
                onError: (err) => toast.error(err.message || "Could not save changes"),
              },
            )
          }
          disabled={update.isPending}
        >
          {update.isPending && <Loader2 className="animate-spin" />} Save changes
        </Button>
      </div>
    </Section>
  );
}
