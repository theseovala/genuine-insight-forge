import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ExternalLink, ShieldCheck, Activity, KeyRound, Plug } from "lucide-react";
import { Section, StatusBadge, EmptyState } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/seovale-db";
import { INTEGRATIONS, integrationById } from "@/lib/integrations/registry";
import {
  disconnectIntegration,
  listIntegrationEvents,
  listIntegrations,
  saveIntegrationAccount,
  startIntegrationOAuth,
  testIntegration,
} from "@/lib/integrations.functions";

import { integrationStatusLabel as statusLabel, integrationStatusTone as statusTone } from "@/lib/integrations/status";

function openAuthorization(url: string) {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) window.location.assign(url);
}

export function IntegrationManager() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listIntegrations);
  const eventsFn = useServerFn(listIntegrationEvents);
  const startFn = useServerFn(startIntegrationOAuth);
  const testFn = useServerFn(testIntegration);
  const saveFn = useServerFn(saveIntegrationAccount);
  const disconnectFn = useServerFn(disconnectIntegration);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const integrations = useQuery({ queryKey: ["integrations"], queryFn: () => listFn() });
  const events = useQuery({ queryKey: ["integration_events"], queryFn: () => eventsFn() });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("integration");
    const status = params.get("status");
    if (!provider || !status) return;
    const label = integrationById(provider)?.label ?? provider;
    if (status === "connected") toast.success(`${label} connected and verified`);
    else toast.error(`${label} could not be connected — see the activity log below`);
    window.history.replaceState({}, "", window.location.pathname);
    void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    void queryClient.invalidateQueries({ queryKey: ["integration_events"] });
  }, [queryClient]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    void queryClient.invalidateQueries({ queryKey: ["integration_events"] });
  };

  const connect = useMutation({
    mutationFn: (provider: string) => startFn({ data: { provider, origin: window.location.origin } }),
    onSuccess: (result) => openAuthorization(result.authorizationUrl),
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setBusy(null),
  });

  const test = useMutation({
    mutationFn: (provider: string) => testFn({ data: { provider } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setBusy(null),
  });

  const save = useMutation({
    mutationFn: ({ provider, accountRef }: { provider: string; accountRef: string }) =>
      saveFn({ data: { provider, accountRef } }),
    onSuccess: (_result, variables) => {
      toast.success("Saved — run Test connection to verify it against the live API");
      refresh();
      setBusy(variables.provider);
      test.mutate(variables.provider);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (provider: string) => disconnectFn({ data: { provider } }),
    onSuccess: () => {
      toast.success("Integration disconnected");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setBusy(null),
  });

  if (integrations.isLoading) {
    return (
      <Section title="Integration manager">
        <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      </Section>
    );
  }

  if (integrations.isError) {
    return (
      <Section title="Integration manager">
        <EmptyState icon={Plug} title="Could not load integrations" description={(integrations.error as Error).message} />
      </Section>
    );
  }

  const state = new Map((integrations.data?.items ?? []).map((item) => [item.provider, item]));
  const isAdmin = integrations.data?.role !== "member";
  const groups = Array.from(new Set(INTEGRATIONS.map((i) => i.group)));

  return (
    <div className="space-y-4">
      <Section
        title="Integration manager"
        description="Every credential is stored encrypted on the server. Status is only shown after a live API call succeeds."
      >
        <div className="flex items-start gap-2.5 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            API keys and tokens never reach the browser. Reconnect a platform whenever you rotate its credentials in the provider
            console.
          </span>
        </div>
      </Section>

      {groups.map((group) => (
        <Section key={group} title={group} bodyClassName="p-0">
          <ul className="divide-y">
            {INTEGRATIONS.filter((i) => i.group === group).map((definition) => {
              const item = state.get(definition.id);
              const status = item?.status ?? "disconnected";
              const pending = busy === definition.id && (connect.isPending || test.isPending || remove.isPending);
              return (
                <li key={definition.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{definition.label}</p>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone[status]}`}>
                          {statusLabel[status] ?? status}
                        </span>
                        {!item?.configured && definition.requiredSecrets.length > 0 && (
                          <StatusBadge status="Credentials missing" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{definition.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {definition.kind === "manual"
                          ? definition.manualReason
                          : item?.accountLabel
                            ? `Account: ${item.accountLabel}${item.lastTestedAt ? ` · last checked ${relativeTime(item.lastTestedAt)}` : ""}`
                            : item?.configured
                              ? "Not connected yet."
                              : `Add ${definition.requiredSecrets.join(" and ")} before connecting.`}
                      </p>
                      {item?.lastError && <p className="mt-1 text-xs text-negative">{item.lastError}</p>}
                      {item?.tokenExpiresAt && status === "connected" && (
                        <p className="mt-1 text-[11px] text-muted-foreground">Access renews automatically · expires {relativeTime(item.tokenExpiresAt)}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={definition.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" /> API docs
                      </a>
                      {definition.kind === "oauth2" && isAdmin && (
                        <Button
                          size="sm"
                          disabled={!item?.configured || pending}
                          onClick={() => {
                            setBusy(definition.id);
                            connect.mutate(definition.id);
                          }}
                        >
                          {pending && connect.isPending && <Loader2 className="animate-spin" />}
                          {status === "connected" ? "Reconnect" : "Connect"}
                        </Button>
                      )}
                      {definition.kind === "managed" && (
                        <span className="text-xs text-muted-foreground">Managed in Connected platforms</span>
                      )}
                      {definition.kind !== "manual" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            setBusy(definition.id);
                            test.mutate(definition.id);
                          }}
                        >
                          {pending && test.isPending ? <Loader2 className="animate-spin" /> : <Activity />}
                          Test connection
                        </Button>
                      )}
                      {isAdmin && definition.kind !== "manual" && definition.kind !== "managed" && item?.status !== "disconnected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            setBusy(definition.id);
                            remove.mutate(definition.id);
                          }}
                        >
                          Disconnect
                        </Button>
                      )}
                    </div>
                  </div>

                  {definition.kind === "api_key" && isAdmin && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="min-w-[220px] flex-1">
                        <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                          <KeyRound className="mr-1 inline size-3" /> {definition.accountField?.label}
                        </span>
                        <input
                          value={drafts[definition.id] ?? item?.accountRef ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [definition.id]: e.target.value }))}
                          className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        />
                        <span className="mt-1 block text-[11px] text-muted-foreground">{definition.accountField?.hint}</span>
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={save.isPending}
                        onClick={() => {
                          const value = (drafts[definition.id] ?? item?.accountRef ?? "").trim();
                          if (!value) {
                            toast.error("Enter a value first");
                            return;
                          }
                          save.mutate({ provider: definition.id, accountRef: value });
                        }}
                      >
                        {save.isPending && <Loader2 className="animate-spin" />} Save & verify
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

      <Section title="Integration activity log" description="Authorization attempts, live tests, token refreshes, expiries and rate limits" bodyClassName="p-0">
        {events.data && events.data.length > 0 ? (
          <ul className="divide-y">
            {events.data.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="text-xs font-semibold">{integrationById(event.provider)?.label ?? event.provider}</span>
                <span className="text-xs text-muted-foreground">{event.event_type.replace(/_/g, " ")}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{event.message}</span>
                {event.http_status && <span className="text-xs text-muted-foreground">HTTP {event.http_status}</span>}
                <span className="text-[11px] text-muted-foreground">{relativeTime(event.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState icon={Activity} title="No integration activity yet" description="Connection attempts and live API tests will be logged here." />
          </div>
        )}
      </Section>
    </div>
  );
}
