import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUp, ChevronDown, Printer } from "lucide-react";
import { BrandMark } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/domain";
import { LEGAL, LEGAL_FACT_LABELS, missingLegalFacts, type LegalFactKey } from "@/lib/legal";
import { cn } from "@/lib/utils";

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

/**
 * A company fact from the legal configuration. When the owner has not supplied
 * it yet, it renders as a visibly marked placeholder — never as invented text.
 */
export function Fact({ k }: { k: LegalFactKey }) {
  const value = LEGAL.facts[k];
  if (value) return <>{value}</>;
  return (
    <mark className="rounded border border-dashed border-warning bg-warning-soft px-1 py-0.5 font-medium text-foreground print:border-black print:bg-transparent">
      [To be provided: {LEGAL_FACT_LABELS[k]}]
    </mark>
  );
}

/** The privacy contact: the configured email as a mailto link, or its placeholder. */
export function PrivacyContact() {
  const email = LEGAL.facts.privacyEmail;
  return email ? (
    <a href={`mailto:${email}`} className="font-medium text-primary underline underline-offset-2">
      {email}
    </a>
  ) : (
    <Fact k="privacyEmail" />
  );
}

export function PublicFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "border-t border-border py-8 text-sm text-muted-foreground print:hidden",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 sm:flex-row sm:justify-between">
        <p>
          {BRAND.footer} — {BRAND.tagline}
        </p>
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
        >
          <Link to="/privacy" className="hover:text-foreground hover:underline">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-foreground hover:underline">
            Terms &amp; Conditions
          </Link>
          <Link to="/privacy" hash="your-rights" className="hover:text-foreground hover:underline">
            Your privacy choices
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function LegalDocument({
  eyebrow,
  title,
  summary,
  highlights,
  sections,
}: {
  eyebrow: string;
  title: string;
  summary: ReactNode;
  highlights: { title: string; body: string }[];
  sections: LegalSection[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const missing = missingLegalFacts();

  // Highlights the section currently being read in the table of contents.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const toc = (
    <ol className="space-y-0.5 text-sm">
      {sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            aria-current={active === s.id ? "location" : undefined}
            className={cn(
              "flex gap-2 rounded-md px-2.5 py-1.5 leading-snug transition-colors",
              active === s.id
                ? "bg-accent font-semibold text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="w-5 shrink-0 tabular-nums opacity-70">{i + 1}.</span>
            <span>{s.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#legal-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur print:static print:border-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark />
            <span className="font-display text-base font-bold tracking-tight">{BRAND.name}</span>
          </Link>
          <nav
            aria-label="Legal documents"
            className="flex items-center gap-1 text-sm print:hidden"
          >
            <Link
              to="/privacy"
              className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
              activeProps={{ className: "bg-accent font-semibold !text-primary" }}
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
              activeProps={{ className: "bg-accent font-semibold !text-primary" }}
            >
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <div className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {summary}
          </div>
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="inline text-muted-foreground">Last updated: </dt>
              <dd className="inline font-semibold">{LEGAL.lastUpdated}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Effective: </dt>
              <dd className="inline font-semibold">
                {LEGAL.effectiveDate ?? "on publication (date to be confirmed by the owner)"}
              </dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Version: </dt>
              <dd className="inline font-semibold tabular-nums">{LEGAL.version}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer /> Print or save as PDF
            </Button>
          </div>

          {missing.length > 0 && (
            <div
              role="note"
              className="mt-6 flex max-w-3xl gap-3 rounded-lg border border-warning/50 bg-warning-soft p-4 text-sm"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p>
                Some company details in this document have not been supplied yet and are shown as
                marked placeholders. Until they are filled in, contact us through the in-app Privacy
                &amp; data page for any request.
              </p>
            </div>
          )}

          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((h) => (
              <li key={h.title} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="text-sm font-semibold">{h.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{h.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="print:hidden">
          <details className="group rounded-xl border border-border bg-card lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
              Contents{" "}
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <nav aria-label="Table of contents" className="border-t border-border p-2">
              {toc}
            </nav>
          </details>
          <nav
            aria-label="Table of contents"
            className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 scrollbar-thin lg:block"
          >
            <p className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </p>
            {toc}
          </nav>
        </aside>

        <article
          id="legal-content"
          className={cn(
            "min-w-0 max-w-3xl text-[15px] leading-7 text-foreground/90",
            "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
            "[&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground",
            "[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5",
            "[&_strong]:font-semibold [&_strong]:text-foreground",
            "[&_table]:mt-4 [&_table]:w-full [&_table]:text-sm [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-3 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top",
          )}
        >
          {sections.map((s, i) => (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-title`}
              className="scroll-mt-24 border-b border-border py-8 first:pt-0 last:border-0 print:break-inside-avoid-page"
            >
              <h2
                id={`${s.id}-title`}
                className="flex items-baseline gap-3 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl"
              >
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.title}
              </h2>
              {s.content}
            </section>
          ))}
          <p className="mt-6 print:hidden">
            <a
              href="#legal-content"
              className="inline-flex items-center gap-1.5 text-sm no-underline"
            >
              <ArrowUp className="size-4" aria-hidden /> Back to top
            </a>
          </p>
        </article>
      </div>

      <PublicFooter />
    </div>
  );
}
