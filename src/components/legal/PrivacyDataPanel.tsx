import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, FileText, Inbox, Loader2, Send, Unplug } from "lucide-react";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  disconnectGoogleBusiness,
  getGoogleBusinessConnection,
} from "@/lib/google-business.functions";
import { LEGAL } from "@/lib/legal";
import {
  PRIVACY_REQUEST_TYPES,
  acceptCurrentTerms,
  getConsentRecord,
  listPrivacyRequests,
  submitPrivacyRequest,
  type PrivacyRequestType,
} from "@/lib/privacy.functions";
import { relativeTime } from "@/lib/seovale-db";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** Settings → Privacy & data: legal agreements, Google access, and privacy requests. */
export function PrivacyDataPanel() {
  const queryClient = useQueryClient();
  const consentFn = useServerFn(getConsentRecord);
  const acceptFn = useServerFn(acceptCurrentTerms);
  const googleFn = useServerFn(getGoogleBusinessConnection);
  const disconnectFn = useServerFn(disconnectGoogleBusiness);
  const listFn = useServerFn(listPrivacyRequests);
  const submitFn = useServerFn(submitPrivacyRequest);

  const consent = useQuery({ queryKey: ["legal_consent"], queryFn: () => consentFn() });
  const google = useQuery({ queryKey: ["google_business_connection"], queryFn: () => googleFn() });
  const requests = useQuery({ queryKey: ["privacy_requests"], queryFn: () => listFn() });

  const [type, setType] = useState<PrivacyRequestType | "">("");
  const [details, setDetails] = useState("");

  const accept = useMutation({
    mutationFn: () => acceptFn(),
    onSuccess: () => {
      toast.success("Your acceptance has been recorded");
      void queryClient.invalidateQueries({ queryKey: ["legal_consent"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Google disconnected — access revoked and stored tokens deleted");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = useMutation({
    mutationFn: () => submitFn({ data: { type: type as PrivacyRequestType, details } }),
    onSuccess: ({ reference }) => {
      toast.success(`Request received — reference ${reference.slice(0, 8).toUpperCase()}`);
      setType("");
      setDetails("");
      void queryClient.invalidateQueries({ queryKey: ["privacy_requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const upToDate = consent.data?.acceptedVersion === consent.data?.currentVersion;
  const g = google.data;

  return (
    <>
      <Section
        title="Legal agreements"
        description="The documents that govern your use of the service"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              to: "/privacy" as const,
              title: "Privacy Policy",
              body: "What we collect, how Google data is used, your rights.",
            },
            {
              to: "/terms" as const,
              title: "Terms & Conditions",
              body: "The rules of the service, and what cannot be guaranteed.",
            },
          ].map((doc) => (
            <Link
              key={doc.to}
              to={doc.to}
              target="_blank"
              className="card-interactive flex gap-3 rounded-lg border p-4"
            >
              <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {doc.title} <ExternalLink className="size-3.5 text-muted-foreground" />
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{doc.body}</span>
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3 text-sm">
          {consent.isLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : consent.data?.acceptedAt ? (
            <p className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-positive" />
              Accepted version {consent.data.acceptedVersion} on{" "}
              {formatDate(consent.data.acceptedAt)}
              {!upToDate && (
                <span className="text-muted-foreground">
                  — a newer version ({LEGAL.version}) is available
                </span>
              )}
            </p>
          ) : (
            <p className="text-muted-foreground">
              No acceptance is on record for this account yet.
            </p>
          )}
          {!consent.isLoading && !upToDate && (
            <Button size="sm" onClick={() => accept.mutate()} disabled={accept.isPending}>
              {accept.isPending && <Loader2 className="animate-spin" />} Accept version{" "}
              {LEGAL.version}
            </Button>
          )}
        </div>
      </Section>

      <Section
        title="Google access"
        description="What Google data this workspace can reach, and how to remove it"
      >
        {google.isLoading ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Google Business Profile</p>
                <p className="text-xs text-muted-foreground">
                  {g?.connected
                    ? `Connected as ${g.email ?? "a Google account"}${g.lastSyncedAt ? ` · last synced ${relativeTime(g.lastSyncedAt)}` : ""}`
                    : g?.email
                      ? `Not usable — ${g.lastError ?? "reconnection needed"}`
                      : "Not connected. No Google Business Profile data is being retrieved."}
                </p>
              </div>
              <StatusBadge status={g?.connected ? "Connected" : "Disconnected"} />
              {g?.email && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                >
                  {disconnect.isPending ? <Loader2 className="animate-spin" /> : <Unplug />}{" "}
                  Disconnect and revoke
                </Button>
              )}
            </div>
            <ul className="mt-4 space-y-1.5 border-t pt-4 text-xs text-muted-foreground">
              <li>
                Disconnecting revokes our access at Google and deletes the stored tokens
                immediately. Only owners and admins can do this.
              </li>
              <li>
                Reviews already synced stay in this workspace until you ask for them to be deleted —
                use “Delete data received from Google” below.
              </li>
              <li>
                You can also remove access from your Google account at{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  myaccount.google.com/permissions
                </a>
                . Other Google services (Search Console, Analytics, YouTube…) are managed in the
                Integration manager tab.
              </li>
            </ul>
          </>
        )}
      </Section>

      <Section
        title="Make a privacy request"
        description="Access, export, correction or deletion of your data"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (type) submit.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="privacy-request-type">What would you like us to do?</Label>
            <Select value={type} onValueChange={(v) => setType(v as PrivacyRequestType)}>
              <SelectTrigger id="privacy-request-type" className="sm:max-w-md">
                <SelectValue placeholder="Choose a request" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PRIVACY_REQUEST_TYPES) as [PrivacyRequestType, string][]).map(
                  ([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="privacy-request-details">Details (optional)</Label>
            <Textarea
              id="privacy-request-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Anything that helps us act on this — for example which data should be corrected."
            />
            <p className="text-[11px] text-muted-foreground">
              Do not include passwords, API keys or other secrets.
            </p>
          </div>
          <Button type="submit" disabled={!type || submit.isPending}>
            {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />} Submit request
          </Button>
          <p className="text-xs text-muted-foreground">
            Every request gets a reference and is recorded in this workspace's activity log. We
            verify requests before acting and respond within the time applicable law requires. See{" "}
            <Link
              to="/privacy"
              hash="your-rights"
              target="_blank"
              className="font-medium text-primary underline underline-offset-2"
            >
              your rights
            </Link>
            .
          </p>
        </form>
      </Section>

      <Section title="Request history" bodyClassName="p-0">
        {requests.isLoading ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : !requests.data?.length ? (
          <div className="p-5">
            <EmptyState
              icon={Inbox}
              title="No privacy requests yet"
              description="Requests you submit appear here with their reference."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {requests.data.map((r) => (
              <li key={r.reference} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {PRIVACY_REQUEST_TYPES[r.type] ?? r.type}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Ref {r.reference.slice(0, 8).toUpperCase()} · {formatDate(r.createdAt)}
                    {!r.mine && " · submitted by a teammate"}
                  </span>
                </span>
                <StatusBadge status={r.status === "received" ? "Received" : r.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
