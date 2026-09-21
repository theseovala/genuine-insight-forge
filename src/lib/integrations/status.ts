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

/**
 * Live-test outcome codes produced by the provider adapters. These are shown
 * next to the coarse connection status so an approval-gated or unconfigured
 * provider is never presented as a plain "Disconnected".
 */
export const integrationOutcomeLabel: Record<string, string> = {
  CONNECTED: "Connected",
  NOT_CONFIGURED: "Configuration required",
  INVALID_CREDENTIALS: "Invalid credentials",
  AUTHENTICATION_FAILED: "Authentication failed",
  INSUFFICIENT_SCOPE: "Insufficient scope",
  RATE_LIMITED: "Rate limited",
  PROVIDER_ERROR: "Provider error",
  APPROVAL_REQUIRED: "Requires provider approval",
  TOKEN_EXPIRED: "Token expired",
  UNAVAILABLE: "Unavailable",
};

export const integrationOutcomeTone: Record<string, string> = {
  CONNECTED: "bg-positive-soft text-positive",
  NOT_CONFIGURED: "bg-neutral-soft text-muted-foreground",
  INVALID_CREDENTIALS: "bg-negative-soft text-negative",
  AUTHENTICATION_FAILED: "bg-negative-soft text-negative",
  INSUFFICIENT_SCOPE: "bg-warning-soft text-rating-foreground",
  RATE_LIMITED: "bg-warning-soft text-rating-foreground",
  PROVIDER_ERROR: "bg-negative-soft text-negative",
  APPROVAL_REQUIRED: "bg-warning-soft text-rating-foreground",
  TOKEN_EXPIRED: "bg-warning-soft text-rating-foreground",
  UNAVAILABLE: "bg-secondary text-secondary-foreground",
};
