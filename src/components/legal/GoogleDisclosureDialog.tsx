import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, KeyRound, Lock, ShieldCheck, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BRAND } from "@/lib/domain";
import { GOOGLE_SCOPE_PURPOSES } from "@/lib/legal";

/** True for providers authorized through Google's OAuth consent screen. */
export const isGoogleOAuthProvider = (scopes: readonly string[]) =>
  scopes.some((s) => s.includes("googleapis.com"));

type Pending = {
  label: string;
  scopes: readonly string[];
  businessProfile: boolean;
  run: () => void;
};

/**
 * The data-access disclosure shown immediately before a user is sent to
 * Google's consent screen. `request` opens it; `run` is only called from the
 * Continue click, so it still counts as a user gesture for opening a popup.
 */
export function useGoogleDisclosure() {
  const [pending, setPending] = useState<Pending | null>(null);
  const request = (p: Pending) => setPending(p);
  const dialog = <GoogleDisclosureDialog pending={pending} onClose={() => setPending(null)} />;
  return { request, dialog };
}

function GoogleDisclosureDialog({
  pending,
  onClose,
}: {
  pending: Pending | null;
  onClose: () => void;
}) {
  const [authorized, setAuthorized] = useState(false);
  const scopes = pending?.scopes ?? [];

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAuthorized(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Before you connect {pending?.label}</DialogTitle>
          <DialogDescription>
            You will be sent to Google to approve access. Here is exactly what {BRAND.name} will be
            able to do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Permissions requested
            </p>
            <ul className="space-y-2">
              {scopes.map((scope) => {
                const info = GOOGLE_SCOPE_PURPOSES[scope];
                return (
                  <li key={scope} className="rounded-lg border bg-muted/40 p-3">
                    <p className="font-semibold">{info?.label ?? scope}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {info?.purpose ?? "Used only for the feature you are connecting."}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                You sign in on Google's own page. {BRAND.name} never sees or stores your Google
                password.
              </span>
            </li>
            <li className="flex gap-2">
              <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                Access tokens are encrypted on our servers and never shown in your browser, URLs or
                logs.
              </span>
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                Google data is used only for the features you see — never sold, never used for
                advertising, never used to train general AI models. Nothing is posted to Google
                unless someone in your team presses Publish.
              </span>
            </li>
            <li className="flex gap-2">
              <Unplug className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                You can disconnect at any time here in Settings, or from your Google account
                permissions page.
              </span>
            </li>
          </ul>

          <p className="text-xs text-muted-foreground">
            {BRAND.name} is not affiliated with or endorsed by Google. Details are in our{" "}
            <Link
              to="/privacy"
              hash="google-data"
              target="_blank"
              className="font-medium text-primary underline underline-offset-2"
            >
              Privacy Policy <ExternalLink className="inline size-3" aria-hidden />
            </Link>{" "}
            and{" "}
            <Link
              to="/terms"
              hash="google-authorization"
              target="_blank"
              className="font-medium text-primary underline underline-offset-2"
            >
              Terms <ExternalLink className="inline size-3" aria-hidden />
            </Link>
            .
          </p>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
            <Checkbox
              checked={authorized}
              onCheckedChange={(v) => setAuthorized(v === true)}
              className="mt-0.5"
            />
            <span className="text-xs leading-relaxed">
              {pending?.businessProfile
                ? `I am authorized to manage the Google Business Profiles I will connect, and I have read how ${BRAND.name} uses this data.`
                : `I am authorized to connect this Google account for my organisation, and I have read how ${BRAND.name} uses this data.`}
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => {
              setAuthorized(false);
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={!authorized}
            onClick={() => {
              const run = pending?.run;
              setAuthorized(false);
              onClose();
              run?.();
            }}
          >
            Continue to Google
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
