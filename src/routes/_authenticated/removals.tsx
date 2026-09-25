import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldX, ScanEye, RefreshCw, Send, CheckCircle2, XCircle, Ban, Sparkles, FileSearch } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section, StatCard, EmptyState, Stars } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { currentWorkspaceId } from "@/lib/seovale-db";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  autoRecheckRemovalCase,
  draftRemovalReply,
  getRemovalCaseDetail,
  getScanSchedule,
  publishRemovalReply,
  recordProviderResponse,
  recordRecheckResult,
  recordSubmission,
  scanReviewsForRemoval,
  updateRemovalCase,
  updateScanSchedule,
} from "@/lib/removal.functions";
import { cn } from "@/lib/utils";

/** Copies text, reporting a blocked clipboard instead of failing silently. */
async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Could not copy", { description: "Clipboard access was blocked. Select the text and copy it manually." });
  }
}


function AppealReply({ caseId, onPublished }: { caseId: string; onPublished: () => void }) {
  const [reply, setReply] = useState("");
  const draft = useServerFn(draftRemovalReply);
  const publish = useServerFn(publishRemovalReply);

  const write = useMutation({
    mutationFn: async () => draft({ data: { caseId } }),
    onSuccess: (result: { reply: string }) => {
      setReply(result.reply);
      toast.success("Reply drafted");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not write the reply."),
  });

  const send = useMutation({
    mutationFn: async () => publish({ data: { caseId, reply } }),
    onSuccess: (result: { postedToGoogle: boolean }) => {
      onPublished();
      toast.success(
        result.postedToGoogle ? "Reply published on Google" : "Reply saved — publish it on the platform",
      );
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not send the reply."),
  });

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">Public reply while the appeal is pending</span>
        <Button size="sm" variant="outline" onClick={() => write.mutate()} disabled={write.isPending}>
          {write.isPending ? <RefreshCw className="animate-spin" /> : <Sparkles />}
          {write.isPending ? "Writing…" : reply ? "Rewrite" : "Draft reply"}
        </Button>
      </div>
      {reply && (
        <>
          <Textarea
            className="mt-2 min-h-24 text-sm"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => send.mutate()} disabled={send.isPending || reply.trim().length < 5}>
              <Send /> {send.isPending ? "Sending…" : "Send reply"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void copyText(reply, "Reply copied")}
            >
              Copy reply
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/removals")({
  head: () => ({
    meta: [
      { title: "Review Removal — Seovale" },
      {
        name: "description",
        content:
          "Automatic policy scanning that flags fake, spam, abusive or off-topic reviews and tracks every removal request to its outcome.",
      },
      { property: "og:title", content: "Review Removal — Seovale" },
      {
        property: "og:description",
        content: "Scan reviews against platform policy and manage removal requests end to end.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RemovalsPage,
});

type CaseRow = {
  id: string;
  review_id: string;
  violation_type: string;
  confidence: number;
  rationale: string;
  appeal_text: string | null;
  status: string;
  /**
   * The verified outcome, derived server-side from recheck evidence. The status
   * is only what a person asserted, so removal is read from here and never from
   * the status.
   */
  outcome: string | null;
  /** How the outcome was established, from the sealed package. Names its source. */
  outcome_basis: string | null;
  /** The primary route and every route detected for the case. */
  route: string | null;
  routes: Array<{ route: string; actionState: string }> | null;
  model: string | null;
  created_at: string;
  reviews: {
    author: string;
    rating: number;
    body: string;
    platform: string;
    location_name: string;
  } | null;
};

const violationLabels: Record<string, string> = {
  fake_or_incentivised: "Fake or incentivised",
  spam_or_advertising: "Spam or advertising",
  hate_or_harassment: "Hate or harassment",
  profanity_or_obscenity: "Profanity",
  off_topic: "Off topic",
  conflict_of_interest: "Conflict of interest",
  personal_information: "Personal information",
};

const statusTone: Record<string, string> = {
  flagged: "bg-warning-soft text-rating-foreground",
  submitted: "bg-info-soft text-info",
  approved: "bg-positive-soft text-positive",
  rejected: "bg-negative-soft text-negative",
  dismissed: "bg-muted text-muted-foreground",
};

const outcomeLabels: Record<string, string> = {
  removed: "Removed",
  retained: "Retained",
  unverified: "Unverified",
};

/**
 * What a case may truthfully be called.
 *
 * A status of "approved" only records that a member marked the case closed; it is
 * not evidence that the platform took the review down. So where the status would
 * otherwise read as removal, the verified outcome is shown instead. Every other
 * status keeps its existing representation, which is already truthful.
 */
function caseLabel(row: CaseRow): string {
  if (row.status !== "approved") return row.status;
  return outcomeLabels[row.outcome ?? ""] ?? "Unverified";
}

/**
 * Tone for the label above, reusing the tones already defined for the statuses so
 * no new styling is introduced: a verified removal keeps the positive tone, a
 * review still published takes the negative one, and anything unverified is muted.
 */
function caseTone(row: CaseRow): string | undefined {
  if (row.status !== "approved") return statusTone[row.status];
  if (row.outcome === "removed") return statusTone["approved"];
  if (row.outcome === "retained") return statusTone["rejected"];
  return statusTone["dismissed"];
}

/**
 * Where a settled outcome came from. A recheck through the provider API is an
 * observation by the system; one a member recorded is their report, and is
 * labelled as that rather than as verified.
 */
function outcomeSource(row: CaseRow): "provider_api" | "user_reported" | null {
  const basis = row.outcome_basis ?? "";
  if (basis.includes("provider_api_recheck")) return "provider_api";
  if (basis.includes("user_reported_observation") || basis.includes("recheck_observation")) return "user_reported";
  return null;
}

const routeLabels: Record<string, string> = {
  platform_policy_report: "Platform policy report",
  platform_appeal: "Platform appeal",
  business_support_escalation: "Business support escalation",
  public_reply_mitigation: "Public reply",
  legal_removal_request: "Legal removal request",
  regulator_complaint: "Regulator complaint",
  court_order_evidence: "Court order evidence",
};

type CaseDetail = {
  integrity: "intact" | "mismatch" | "not_sealed";
  packageSha256: string | null;
  providerDecision: string;
  outcome: string;
  outcomeBasis: string;
  nextRecheckDue: string | null;
  routes: Array<{ route: string; actionState: string; blockedBy: string | null }>;
  ledger: Array<{ phase: string; at: string; observation: string; source?: { type?: string } }>;
};

/** The evidence package and verification ledger of one case, integrity-checked server-side. */
function CaseEvidence({ caseId }: { caseId: string }) {
  const read = useServerFn(getRemovalCaseDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["removal_case_detail", caseId],
    queryFn: async () => (await read({ data: { caseId } })) as unknown as CaseDetail,
  });
  if (isLoading) return <p className="mt-3 text-xs text-muted-foreground">Loading evidence…</p>;
  if (error || !data) return <p className="mt-3 text-xs text-destructive">Could not load the evidence package.</p>;
  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
      <div>
        <span className="font-semibold">Package integrity: </span>
        {data.integrity === "intact"
          ? `Intact — hash re-checked (${data.packageSha256?.slice(0, 12)}…)`
          : data.integrity === "mismatch"
            ? "MISMATCH — the stored package no longer matches its sealed hash"
            : "Not sealed — this case predates the evidence package"}
      </div>
      <div>
        <span className="font-semibold">Platform decision: </span>
        {data.providerDecision === "none" ? "none recorded" : data.providerDecision}
      </div>
      <div>
        <span className="font-semibold">Outcome: </span>
        {outcomeLabels[data.outcome] ?? data.outcome} — {data.outcomeBasis}
      </div>
      {data.nextRecheckDue && (
        <div>
          <span className="font-semibold">Next recheck due: </span>
          {new Date(data.nextRecheckDue).toLocaleString()}
        </div>
      )}
      {data.routes.length > 0 && (
        <div>
          <span className="font-semibold">Routes:</span>
          <ul className="mt-1 list-disc pl-5">
            {data.routes.map((r) => (
              <li key={r.route}>
                {routeLabels[r.route] ?? r.route} — {r.actionState.toLowerCase().replace(/_/g, " ")}
                {r.blockedBy ? ` (${r.blockedBy})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <span className="font-semibold">Ledger:</span>
        <ul className="mt-1 space-y-1">
          {data.ledger.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className="font-semibold">{entry.phase}</span> · {new Date(entry.at).toLocaleString()} · {entry.source?.type ?? "unknown source"} — {entry.observation}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The actions for one case. Each case owns its mutations, so a pending action
 * disables only its own buttons. Every action writes a ledger entry through the
 * verification loop; none of them can mark a review removed on its own — only
 * a recheck can, and a recheck a member records is labelled user-reported.
 */
function CaseActions({ c, onChanged }: { c: CaseRow; onChanged: () => void }) {
  const qc = useQueryClient();
  const update = useServerFn(updateRemovalCase);
  const submit = useServerFn(recordSubmission);
  const respond = useServerFn(recordProviderResponse);
  const recheckAuto = useServerFn(autoRecheckRemovalCase);
  const recheckManual = useServerFn(recordRecheckResult);

  const [mode, setMode] = useState<null | "submit" | "decision" | "recheck">(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const detected = (c.routes ?? []).map((r) => r.route);
  const defaultRoute = c.status === "rejected" && detected.includes("platform_appeal") ? "platform_appeal" : (c.route ?? detected[0] ?? "platform_policy_report");
  const [route, setRoute] = useState(defaultRoute);
  const [reference, setReference] = useState("");
  const [decision, setDecision] = useState<"accepted" | "rejected" | "no_response">("accepted");
  const [verbatim, setVerbatim] = useState("");
  const [manualReason, setManualReason] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const platform = c.reviews?.platform ?? "the platform";

  const done = (message: string) => {
    setMode(null);
    setReference("");
    setVerbatim("");
    setMethod("");
    setManualReason(null);
    onChanged();
    void qc.invalidateQueries({ queryKey: ["removal_case_detail", c.id] });
    toast.success(message);
  };
  const fail = (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update the case.");

  const dismiss = useMutation({
    mutationFn: async () => update({ data: { id: c.id, status: "dismissed" } }),
    onSuccess: () => done("Case dismissed"),
    onError: fail,
  });

  const recordSubmit = useMutation({
    mutationFn: async () =>
      submit({
        data: {
          caseId: c.id,
          route,
          channel: "manual_provider_interface",
          observation: `A workspace member filed this case with ${platform} through the ${routeLabels[route] ?? route} route.`,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        },
      }),
    onSuccess: () => done("Submission recorded"),
    onError: fail,
  });

  const recordDecision = useMutation({
    mutationFn: async () => {
      await respond({
        data: {
          caseId: c.id,
          channel: "provider_interface",
          verbatim: verbatim.trim(),
          decision,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        },
      });
      // The status follows the platform's decision; a "no response" leaves it open.
      if (decision !== "no_response") {
        await update({ data: { id: c.id, status: decision === "accepted" ? "approved" : "rejected" } });
      }
    },
    onSuccess: () => done("Platform decision recorded — recheck the review to verify the outcome"),
    onError: fail,
  });

  const autoRecheck = useMutation({
    mutationFn: async () => recheckAuto({ data: { caseId: c.id } }),
    onSuccess: (result: { performed: boolean; reason?: string; reviewVisible?: boolean }) => {
      if (result.performed) {
        done(result.reviewVisible ? `Recheck via ${platform} API: the review is still published` : `Recheck via ${platform} API: the review is no longer returned`);
      } else {
        setManualReason(result.reason ?? "No automatic recheck is available for this review.");
        setMode("recheck");
      }
    },
    onError: fail,
  });

  const manualRecheck = useMutation({
    mutationFn: async (reviewVisible: boolean) =>
      recheckManual({
        data: {
          caseId: c.id,
          reviewVisible,
          method: method.trim(),
          observation: `A workspace member reported the review as ${reviewVisible ? "still visible" : "no longer visible"} on ${platform}.`,
          closeCase: true,
        },
      }),
    onSuccess: () => done("User-reported recheck recorded"),
    onError: fail,
  });

  const busy = dismiss.isPending || recordSubmit.isPending || recordDecision.isPending || autoRecheck.isPending || manualRecheck.isPending;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {c.appeal_text && (
          <Button size="sm" variant="outline" onClick={() => void copyText(c.appeal_text ?? "", "Appeal text copied")}>
            Copy appeal
          </Button>
        )}
        {(c.status === "flagged" || c.status === "rejected") && (
          <Button size="sm" onClick={() => setMode(mode === "submit" ? null : "submit")} disabled={busy}>
            <Send /> {c.status === "rejected" ? "Submit again / appeal" : "Mark submitted"}
          </Button>
        )}
        {c.status === "submitted" && (
          <>
            <Button size="sm" onClick={() => { setDecision("accepted"); setMode("decision"); }} disabled={busy}>
              <CheckCircle2 /> Platform accepted
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setDecision("rejected"); setMode("decision"); }} disabled={busy}>
              <XCircle /> Platform rejected
            </Button>
          </>
        )}
        {["submitted", "approved", "rejected"].includes(c.status) && (
          <Button size="sm" variant="outline" onClick={() => autoRecheck.mutate()} disabled={busy}>
            {autoRecheck.isPending ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
            {autoRecheck.isPending ? "Rechecking…" : "Recheck review"}
          </Button>
        )}
        {c.status !== "dismissed" && !["approved", "rejected"].includes(c.status) && (
          <Button size="sm" variant="ghost" onClick={() => dismiss.mutate()} disabled={busy}>
            <Ban /> Dismiss
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowEvidence(!showEvidence)}>
          <FileSearch /> {showEvidence ? "Hide evidence" : "Evidence"}
        </Button>
      </div>

      {mode === "submit" && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
          <div className="min-w-56">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Route used</span>
            <Select value={route} onValueChange={setRoute}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(detected.length > 0 ? detected : [defaultRoute]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {routeLabels[r] ?? r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-56 flex-1">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Platform reference (optional)</span>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Case or ticket number the platform gave you" />
          </div>
          <Button size="sm" onClick={() => recordSubmit.mutate()} disabled={busy}>
            {recordSubmit.isPending ? "Saving…" : "Record submission"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            Cancel
          </Button>
        </div>
      )}

      {mode === "decision" && (
        <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-44">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Platform decision</span>
              <Select value={decision} onValueChange={(v) => setDecision(v as typeof decision)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="no_response">No response</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-56 flex-1">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Platform reference (optional)</span>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Only a reference the platform issued" />
            </div>
          </div>
          <Textarea
            className="min-h-20 text-sm"
            value={verbatim}
            onChange={(e) => setVerbatim(e.target.value)}
            placeholder="Paste the platform's answer exactly as you received it"
          />
          <p className="text-[11px] text-muted-foreground">
            A platform accepting the report does not mark the review removed. Recheck the review afterwards to verify it.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => recordDecision.mutate()} disabled={busy || verbatim.trim().length === 0}>
              {recordDecision.isPending ? "Saving…" : "Record decision"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "recheck" && (
        <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{manualReason}</p>
          <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder={`How you checked, e.g. "opened the ${platform} listing and searched for the reviewer"`} />
          <p className="text-[11px] text-muted-foreground">
            Recorded as a user-reported observation — not verified through the platform API.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => manualRecheck.mutate(true)} disabled={busy || method.trim().length < 3}>
              Still visible
            </Button>
            <Button size="sm" variant="outline" onClick={() => manualRecheck.mutate(false)} disabled={busy || method.trim().length < 3}>
              No longer visible
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {showEvidence && <CaseEvidence caseId={c.id} />}
    </>
  );
}

const tabs = ["Flagged", "Submitted", "Resolved", "All"] as const;

function useRemovalCases() {
  return useQuery({
    queryKey: ["removal_cases"],
    queryFn: async (): Promise<CaseRow[]> => {
      const workspaceId = await currentWorkspaceId();
      const { data, error } = await supabase
        .from("removal_cases")
        .select(
          "id, review_id, violation_type, confidence, rationale, appeal_text, status, outcome, outcome_basis:evidence->verification->>outcomeBasis, route, routes:evidence->routes, model, created_at, reviews(author, rating, body, platform, location_name)",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CaseRow[];
    },
  });
}

function useLastScan() {
  return useQuery({
    queryKey: ["removal_scans", "latest"],
    queryFn: async () => {
      const workspaceId = await currentWorkspaceId();
      const { data, error } = await supabase
        .from("removal_scans")
        .select("reviews_checked, reviews_flagged, model, status, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

const INTERVALS = [
  { value: 60, label: "Every hour" },
  { value: 180, label: "Every 3 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once a day" },
  { value: 10080, label: "Once a week" },
];

const BATCHES = [10, 20, 40, 60, 100, 120];

interface Schedule {
  canEdit: boolean;
  enabled: boolean;
  intervalMinutes: number;
  batchSize: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  pausedReason: string | null;
}

function ScanSchedule() {
  const qc = useQueryClient();
  const read = useServerFn(getScanSchedule);
  const save = useServerFn(updateScanSchedule);

  const { data } = useQuery({
    queryKey: ["removal_scan_schedule"],
    queryFn: async () => (await read()) as Schedule,
  });

  const update = useMutation({
    mutationFn: async (patch: {
      enabled?: boolean;
      intervalMinutes?: number;
      batchSize?: number;
      resume?: boolean;
    }) => save({ data: patch }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["removal_scan_schedule"] });
      toast.success("Automatic scan updated");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save the scan schedule."),
  });

  if (!data) return null;
  const disabled = !data.canEdit || update.isPending;

  return (
    <Section
      title="Automatic scanning"
      description="After new reviews sync, the scan runs on its own at the interval you choose."
    >
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch
            checked={data.enabled}
            disabled={disabled}
            onCheckedChange={(enabled) => update.mutate({ enabled })}
          />
          {data.enabled ? "On" : "Off"}
        </label>

        <div className="min-w-44">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">How often</span>
          <Select
            value={String(data.intervalMinutes)}
            disabled={disabled}
            onValueChange={(value) => update.mutate({ intervalMinutes: Number(value) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-40">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            Reviews per run
          </span>
          <Select
            value={String(data.batchSize)}
            disabled={disabled}
            onValueChange={(value) => update.mutate({ batchSize: Number(value) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCHES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} reviews
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground">
          <div>Last run: {data.lastRunAt ? new Date(data.lastRunAt).toLocaleString() : "—"}</div>
          <div>
            Next run:{" "}
            {data.enabled && data.nextRunAt ? new Date(data.nextRunAt).toLocaleString() : "—"}
          </div>
        </div>
      </div>

      {data.pausedReason && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <span className="font-semibold text-destructive">Paused: {data.pausedReason}</span>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => update.mutate({ resume: true })}>
            Resume scanning
          </Button>
        </div>
      )}
    </Section>
  );
}

function RemovalsPage() {

  const [tab, setTab] = useState<(typeof tabs)[number]>("Flagged");
  const { data: cases = [], isLoading } = useRemovalCases();
  const { data: lastScan, isFetched: lastScanFetched } = useLastScan();
  const qc = useQueryClient();
  const scan = useServerFn(scanReviewsForRemoval);
  const readSchedule = useServerFn(getScanSchedule);
  const { data: schedule } = useQuery({
    queryKey: ["removal_scan_schedule"],
    queryFn: async () => (await readSchedule()) as Schedule,
  });
  const autoScanned = useRef(false);

  const runScan = useMutation({
    mutationFn: async () => scan({ data: {} }),
    onSuccess: (result: { checked: number; flagged: number }) => {
      void qc.invalidateQueries({ queryKey: ["removal_cases"] });
      void qc.invalidateQueries({ queryKey: ["removal_scans", "latest"] });
      void qc.invalidateQueries({ queryKey: ["removal_scan_schedule"] });
      if (result.checked === 0) toast.success("Every review has already been scanned.");
      else
        toast.success(
          `Scanned ${result.checked} reviews — ${result.flagged} flagged for removal.`,
        );
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Scan could not finish."),
  });

  // Scan automatically when the page opens, but only once the last scan is older
  // than the configured interval — not on every visit, since each scan is a paid
  // AI call. Turning automatic scanning off also stops this page-open scan.
  useEffect(() => {
    if (autoScanned.current || isLoading || !schedule || !lastScanFetched) return;
    autoScanned.current = true;
    if (!schedule.enabled) return;
    const lastRun = Math.max(
      schedule.lastRunAt ? Date.parse(schedule.lastRunAt) : 0,
      lastScan?.created_at ? Date.parse(lastScan.created_at) : 0,
    );
    if (Date.now() - lastRun >= schedule.intervalMinutes * 60_000) runScan.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, schedule, lastScanFetched]);

  const visible = cases.filter((c) =>
    tab === "All"
      ? true
      : tab === "Flagged"
        ? c.status === "flagged"
        : tab === "Submitted"
          ? c.status === "submitted"
          : ["approved", "rejected", "dismissed"].includes(c.status),
  );

  const flagged = cases.filter((c) => c.status === "flagged").length;
  const submitted = cases.filter((c) => c.status === "submitted").length;
  // Counted from the verified outcome, never from the status: a case a member
  // marked closed is not a review the platform actually took down.
  const removed = cases.filter((c) => c.outcome === "removed").length;
  const removedUserReported = cases.filter((c) => c.outcome === "removed" && outcomeSource(c) === "user_reported").length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Reputation defence"
        title="Review Removal"
        description="Every review is scanned against platform content policy. Genuine criticism is never flagged — only reviews that break the rules."
        actions={
          <Button onClick={() => runScan.mutate()} disabled={runScan.isPending}>
            {runScan.isPending ? (
              <RefreshCw className="animate-spin" />
            ) : (
              <ScanEye />
            )}
            {runScan.isPending ? "Scanning…" : "Scan reviews"}
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Flagged" value={String(flagged)} icon={ShieldX} />
        <StatCard label="Submitted" value={String(submitted)} icon={Send} />
        <StatCard
          label="Removed"
          value={String(removed)}
          icon={CheckCircle2}
          {...(removedUserReported > 0 ? { sub: `${removedUserReported} user-reported, not API-verified` } : {})}
        />
        <StatCard
          label="Last scan"
          value={lastScan ? `${lastScan.reviews_checked} checked` : "—"}
          icon={ScanEye}
          sub={lastScan ? `${lastScan.reviews_flagged} flagged` : "No scan yet"}
        />
      </div>

      <div className="mb-6">
        <ScanSchedule />
      </div>



      <Section
        title="Removal cases"
        description="Cases created by the automatic policy scan, with the appeal text you can send to the platform."
        bodyClassName="p-0"
        action={
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                  tab === t ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        }
      >
        {visible.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={ShieldX}
              title={isLoading || runScan.isPending ? "Scanning your reviews…" : "Nothing breaks policy"}
              description={
                isLoading || runScan.isPending
                  ? "The policy scan is checking your latest reviews."
                  : "No review in this view breaks platform content policy. Honest negative feedback is deliberately never flagged."
              }
            />
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-negative-soft px-2 py-0.5 text-[11px] font-bold text-negative">
                    {violationLabels[c.violation_type] ?? c.violation_type}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-bold capitalize",
                      caseTone(c) ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {caseLabel(c)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {Math.round(Number(c.confidence) * 100)}% confidence
                  </span>
                  {c.outcome && c.outcome !== "unverified" && (
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {outcomeLabels[c.outcome] ?? c.outcome}
                      {outcomeSource(c) === "provider_api" ? " · verified via platform API" : outcomeSource(c) === "user_reported" ? " · user-reported, not verified" : ""}
                    </span>
                  )}
                  {c.reviews && (
                    <span className="text-[11px] text-muted-foreground">
                      {c.reviews.platform} · {c.reviews.location_name}
                    </span>
                  )}
                </div>

                {c.reviews && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm font-semibold">{c.reviews.author}</span>
                    <Stars value={c.reviews.rating} />
                  </div>
                )}
                {c.reviews && (
                  <p className="mt-1 text-sm text-muted-foreground">{c.reviews.body}</p>
                )}

                <p className="mt-3 text-sm">
                  <span className="font-semibold">Why it breaks policy: </span>
                  {c.rationale}
                </p>
                {c.appeal_text && (
                  <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    {c.appeal_text}
                  </p>
                )}

                <CaseActions c={c} onChanged={() => void qc.invalidateQueries({ queryKey: ["removal_cases"] })} />

                {["flagged", "submitted"].includes(c.status) && (
                  <AppealReply
                    caseId={c.id}
                    onPublished={() => void qc.invalidateQueries({ queryKey: ["removal_cases"] })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AppShell>
  );
}
