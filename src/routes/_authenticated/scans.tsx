import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Radar,
  Loader2,
  Download,
  RefreshCw,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Section, EmptyState } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createScan, runScanNow, listScans, getScan, exportScanCsv } from "@/lib/scan.functions";

export const Route = createFileRoute("/_authenticated/scans")({
  head: () => ({
    meta: [
      { title: "Website Scan Engine — Seovale" },
      {
        name: "description",
        content:
          "Scan any website address for real technical, SEO, security, DNS and domain findings, with evidence, AI priorities and CSV export.",
      },
      { property: "og:title", content: "Website Scan Engine — Seovale" },
      { property: "og:description", content: "Real URL scanning with evidence-backed findings and CSV export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScansPage,
});

const SOURCE_LABEL: Record<string, string> = {
  http: "Website page",
  tls: "HTTPS / certificate",
  dns: "DNS records",
  rdap: "Domain registration",
  crawl_directives: "robots.txt & sitemap",
  pagespeed: "Google PageSpeed",
  ai_analysis: "AI analysis",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
  info: "bg-muted text-muted-foreground border-border",
};

function SourceIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "not_configured") return <Clock className="h-4 w-4 text-muted-foreground" />;
  if (status === "skipped") return <Clock className="h-4 w-4 text-muted-foreground" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

function ScansPage() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openFinding, setOpenFinding] = useState<string | null>(null);

  const scans = useQuery({ queryKey: ["scans"], queryFn: () => listScans() });
  const detail = useQuery({
    queryKey: ["scan", activeId],
    queryFn: () => getScan({ data: { id: activeId as string } }),
    enabled: Boolean(activeId),
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.scan?.status;
      return status === "queued" || status === "running" ? 4000 : false;
    },
  });

  // The scan runs on the server; the browser is never blocked while it works.
  // The detail query below polls until the stored status leaves queued/running.
  const start = useMutation({
    mutationFn: async (target: string) => {
      const created = await createScan({ data: { url: target } });
      setActiveId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["scans"] });
      runScanNow({ data: { id: created.id } })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["scans"] });
          queryClient.invalidateQueries({ queryKey: ["scan"] });
        })
        .catch((error: Error) => toast.error(error.message));
      return created;
    },
    onSuccess: () => toast.success("Scan started — results appear as each source answers"),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteScan({ data: { id } }),
    onSuccess: () => {
      setActiveId(null);
      toast.success("Scan deleted");
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rescan = useMutation({
    mutationFn: async (target: string) => {
      const created = await createScan({ data: { url: target } });
      setActiveId(created.id);
      return await runScanNow({ data: { id: created.id } });
    },
    onSuccess: () => {
      toast.success("Re-scan complete");
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      queryClient.invalidateQueries({ queryKey: ["scan"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const download = useMutation({
    mutationFn: (id: string) => exportScanCsv({ data: { id } }),
    onSuccess: (result) => {
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = detail.data as any;
  const busy = start.isPending || rescan.isPending;

  return (
    <AppShell>
      <PageHeader
        title="Website Scan Engine"
        description="Paste a website address. Seovale checks it live and reports only what it actually measured."
      />

      <Section title="New scan" description="One address per scan. Everything measured is stored with its evidence and timestamp.">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim()) start.mutate(url.trim());
          }}
        >
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="seovale.com" className="sm:max-w-md" />
          <Button type="submit" disabled={busy || !url.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            {busy ? "Scanning…" : "Start scan"}
          </Button>
        </form>
      </Section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Section title="Scan history" description="Completed scans are kept so results can be compared over time.">
          {scans.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading
            </div>
          ) : (scans.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No scans yet.</p>
          ) : (
            <ul className="space-y-1">
              {(scans.data as any[]).map((scan) => (
                <li key={scan.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(scan.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      activeId === scan.id ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="block truncate font-medium">{scan.target_domain}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase">
                        {scan.status}
                      </Badge>
                      {scan.score === null ? "No score" : `${scan.score}/100`}
                      <span>· {new Date(scan.created_at).toLocaleString()}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="space-y-4">
          {!activeId ? (
            <Section title="Scan result">
              <EmptyState icon={Radar} title="No scan selected" description="Start a scan or pick one from the history to see its findings and evidence." />
            </Section>
          ) : detail.isLoading || !data ? (
            <Section title="Scan result">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading scan
              </div>
            </Section>
          ) : (
            <>
              <Section
                title={data.scan.target_domain}
                description={`${data.scan.status} · ${data.scan.score === null ? "Score unavailable" : `Score ${data.scan.score}/100`}`}
                action={
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => rescan.mutate(data.scan.target_url)} disabled={busy}>
                      {rescan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-scan
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => download.mutate(data.scan.id)} disabled={download.isPending}>
                      <Download className="h-4 w-4" /> CSV
                    </Button>
                  </div>
                }
              >
                {data.scan.error_message ? (
                  <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{data.scan.error_message}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {data.report?.summary ? data.report.summary : "AI summary unavailable for this scan."}
                </p>
                {data.report?.model ? <p className="mt-2 text-xs text-muted-foreground">Analysed by {data.report.model}</p> : null}
              </Section>

              <Section title="Scan health" description="Every source that was contacted, with what it returned.">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {data.sources.map((source: any) => (
                    <li key={source.source} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <SourceIcon status={source.status} />
                      <div className="min-w-0">
                        <p className="font-medium">{SOURCE_LABEL[source.source] ?? source.source}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {source.status === "not_configured"
                            ? "Provider not configured"
                            : source.error_message
                              ? source.error_message
                              : `Retrieved ${new Date(source.created_at).toLocaleString()} · ${source.freshness}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>

              {data.comparison ? (
                <Section title="Compared with the previous scan" description={`Previous scan ${new Date(data.comparison.previousAt).toLocaleString()} · score ${data.comparison.previousScore ?? "unavailable"}`}>
                  <div className="grid gap-3 sm:grid-cols-3 text-sm">
                    <div>
                      <p className="font-medium text-emerald-600">Resolved ({data.comparison.resolved.length})</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        {data.comparison.resolved.slice(0, 6).map((item: any) => <li key={item.code}>{item.title}</li>)}
                        {data.comparison.resolved.length === 0 ? <li>None</li> : null}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-destructive">New issues ({data.comparison.introduced.length})</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        {data.comparison.introduced.slice(0, 6).map((item: any) => <li key={item.code}>{item.title}</li>)}
                        {data.comparison.introduced.length === 0 ? <li>None</li> : null}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium">Unchanged</p>
                      <p className="mt-1 text-muted-foreground">{data.comparison.unchanged} findings</p>
                    </div>
                  </div>
                </Section>
              ) : null}

              <Section title={`Findings (${data.findings.length})`} description="Each finding links back to the measurement it came from.">
                {data.findings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No issues were detected in what could be measured.</p>
                ) : (
                  <ul className="space-y-2">
                    {[...data.findings]
                      .sort((a: any, b: any) => b.impact - a.impact)
                      .map((finding: any) => (
                        <li key={finding.code} className="rounded-lg border border-border">
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 px-3 py-2 text-left"
                            aria-expanded={openFinding === finding.code}
                            onClick={() => setOpenFinding(openFinding === finding.code ? null : finding.code)}
                          >
                            <AlertTriangle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">{finding.title}</span>
                              <span className="block text-xs text-muted-foreground">{finding.detail}</span>
                            </span>
                            <Badge variant="outline" className={cn("h-5 shrink-0 px-1.5 text-[10px] uppercase", SEVERITY_TONE[finding.severity])}>
                              {finding.severity}
                            </Badge>
                            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", openFinding === finding.code && "rotate-180")} />
                          </button>
                          {openFinding === finding.code ? (
                            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                              {finding.recommendation ? <p className="mb-2 text-foreground">Recommendation: {finding.recommendation}</p> : null}
                              <p>Source: {SOURCE_LABEL[finding.source] ?? finding.source} · Confidence: {finding.evidence?.confidence ?? "measured"} · Impact: -{finding.impact}</p>
                              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/60 p-2 text-[11px]">{JSON.stringify(finding.evidence ?? {}, null, 2)}</pre>
                            </div>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                )}
              </Section>

              <Section title={`Measurements (${data.metrics.length})`} description="Normalized values taken straight from the collected data.">
                {data.metrics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Data unavailable.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-muted-foreground">
                          <th className="py-1 pr-3">Category</th>
                          <th className="py-1 pr-3">Measurement</th>
                          <th className="py-1 pr-3">Value</th>
                          <th className="py-1">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.metrics.map((metric: any) => (
                          <tr key={`${metric.category}-${metric.metric_key}`} className="border-t border-border/60">
                            <td className="py-1 pr-3 text-muted-foreground">{metric.category}</td>
                            <td className="py-1 pr-3">{metric.metric_key.replace(/_/g, " ")}</td>
                            <td className="py-1 pr-3">
                              {metric.value_numeric ?? metric.value_text ?? "DATA NOT AVAILABLE"}
                              {metric.unit ? ` ${metric.unit}` : ""}
                            </td>
                            <td className="py-1 text-muted-foreground">{SOURCE_LABEL[metric.source] ?? metric.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
