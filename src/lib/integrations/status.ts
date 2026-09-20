// Shared, client-safe presentation for integration connection status.
export const integrationStatusLabel: Record<string, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
  expired: "Expired",
  unavailable: "Unavailable",
};

export const integrationStatusTone: Record<string, string> = {
  connected: "bg-positive-soft text-positive",
  disconnected: "bg-neutral-soft text-muted-foreground",
  error: "bg-negative-soft text-negative",
  expired: "bg-warning-soft text-rating-foreground",
  unavailable: "bg-secondary text-secondary-foreground",
};
