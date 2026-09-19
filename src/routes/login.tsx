import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Star, ShieldCheck, Globe2 } from "lucide-react";
import { BrandMark, Stars } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — RepuVala™ Reputation Command Center" },
      {
        name: "description",
        content:
          "Sign in to RepuVala™, the online reputation command center for brands, franchises, agencies and multi-location businesses.",
      },
      { property: "og:title", content: "Sign in — RepuVala™" },
      { property: "og:description", content: "Your Reputation. One Powerful Command Center." },
    ],
  }),
  component: LoginPage,
});

const journey = ["Connect", "Monitor", "Understand", "Prioritise", "Respond", "Improve", "Report"];

function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-hero p-10 text-primary-foreground lg:flex">
        <div className="absolute -right-24 -top-24 size-80 rounded-full bg-white/5 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <BrandMark light />
          <div>
            <p className="font-display text-lg font-extrabold">RepuVala<span className="align-super text-[10px]">™</span></p>
            <p className="text-[11px] text-primary-foreground/70">Online Reputation Management</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="font-display text-4xl font-bold leading-tight">
            Your Reputation.
            <br />
            One Powerful Command Center.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-primary-foreground/80">
            RepuVala brings Google, Facebook, Instagram, YouTube, Trustpilot, Yelp and TripAdvisor
            into a single console — with monitoring, sentiment analysis, alerts, response workflows,
            multi-location comparison and board-ready reporting.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {journey.map((j) => (
              <span key={j} className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold backdrop-blur">{j}</span>
            ))}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              [Star, "4.5★", "average rating tracked"],
              [Globe2, "6", "locations, 4 countries"],
              [ShieldCheck, "91%", "reviews answered"],
            ].map(([Icon, v, l], i) => {
              const I = Icon as typeof Star;
              return (
                <div key={i} className="rounded-xl bg-white/10 p-4 backdrop-blur">
                  <I className="size-4 text-primary-foreground/80" />
                  <p className="mt-2 font-display text-xl font-bold">{v as string}</p>
                  <p className="text-[11px] text-primary-foreground/70">{l as string}</p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="relative text-xs text-primary-foreground/70">
          Powered by <span className="font-semibold text-primary-foreground">Software Vala™</span> — The Name of Trust
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <p className="font-display text-lg font-extrabold">RepuVala™</p>
          </div>

          <h2 className="font-display text-2xl font-bold">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your reputation command center.</p>

          <form className="mt-7 space-y-4" onSubmit={(e) => e.preventDefault()}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Work email</span>
              <input
                type="email"
                placeholder="you@company.com"
                className="h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Password</span>
              <input
                type="password"
                placeholder="••••••••"
                className="h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" className="size-3.5 accent-[var(--primary)]" /> Keep me signed in
              </label>
              <a href="#" className="font-semibold text-primary hover:underline">Forgot password?</a>
            </div>
            <Button className="h-11 w-full" asChild>
              <Link to="/">Enter command center <ArrowRight /></Link>
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2">
            <Button variant="outline" className="h-11 w-full">Continue with Google Workspace</Button>
            <Button variant="outline" className="h-11 w-full">Continue with SSO</Button>
          </div>

          <div className="mt-8 rounded-xl border bg-muted/40 p-4">
            <Stars value={5} size={13} />
            <p className="mt-2 text-xs italic text-muted-foreground">
              “We went from chasing reviews across six tabs to one morning check-in. Our response time
              halved in a month.”
            </p>
            <p className="mt-2 text-[11px] font-semibold">Head of Customer Experience, multi-location retail group</p>
          </div>

          <p className="mt-8 text-center text-[11px] text-muted-foreground">
            RepuVala™ · Powered by <span className="font-semibold text-foreground">Software Vala™</span>
          </p>
        </div>
      </section>
    </div>
  );
}
