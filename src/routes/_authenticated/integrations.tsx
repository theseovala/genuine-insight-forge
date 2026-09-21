import { createFileRoute, redirect } from "@tanstack/react-router";

/** The integration centre lives in Settings; this keeps /integrations a working link. */
export const Route = createFileRoute("/_authenticated/integrations")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { tab: "integrations" } as never });
  },
});
