// Client-safe metadata for every third-party account Seovale can connect.
// Only names and documentation links live here — never secret values.

export type IntegrationKind = "oauth2" | "api_key" | "managed" | "manual";

export interface CredentialField {
  /** Storage key — matches the server environment variable name. */
  key: string;
  label: string;
  /** Secret values are write-only: they are never returned to the browser. */
  secret: boolean;
  placeholder?: string;
  hint?: string;
}

export interface IntegrationDefinition {
  id: string;
  group: string;
  label: string;
  description: string;
  kind: IntegrationKind;
  /** Environment variable names (values never leave the server). */
  requiredSecrets: string[];
  scopes: string[];
  docsUrl: string;
  /** Extra identifier the admin must supply for api_key providers. */
  accountField?: { label: string; hint: string };
  /** Why a manual provider cannot be self-served. */
  manualReason?: string;
  /**
   * Vault bucket the credentials are stored under. Providers that share one
   * developer application (Gmail + YouTube, Facebook + Instagram) share a group.
   */
  credentialGroup?: string;
  /** Provider-specific credential schema shown in the configuration panel. */
  credentialFields?: CredentialField[];
}

const GOOGLE_OAUTH_FIELDS: CredentialField[] = [
  { key: "GOOGLE_OAUTH_CLIENT_ID", label: "Client ID", secret: false, placeholder: "1234567890-abc.apps.googleusercontent.com" },
  { key: "GOOGLE_OAUTH_CLIENT_SECRET", label: "Client secret", secret: true, placeholder: "GOCSPX-..." },
  { key: "GOOGLE_API_KEY", label: "API key (optional)", secret: true, hint: "Only required for Google API-key endpoints." },
];

const META_FIELDS: CredentialField[] = [
  { key: "FACEBOOK_APP_ID", label: "App ID", secret: false },
  { key: "FACEBOOK_APP_SECRET", label: "App secret", secret: true },
];

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: "google_business",
    group: "Google",
    label: "Google Business Profile",
    description: "Locations, reviews and public replies.",
    kind: "managed",
    requiredSecrets: ["GOOGLE_BUSINESS_CLIENT_ID", "GOOGLE_BUSINESS_CLIENT_SECRET"],
    scopes: ["https://www.googleapis.com/auth/business.manage"],
    docsUrl: "https://developers.google.com/my-business/content/review-data",
    credentialGroup: "google_business",
    credentialFields: [
      { key: "GOOGLE_BUSINESS_CLIENT_ID", label: "Client ID", secret: false, placeholder: "...apps.googleusercontent.com" },
      { key: "GOOGLE_BUSINESS_CLIENT_SECRET", label: "Client secret", secret: true, placeholder: "GOCSPX-..." },
    ],
  },
  {
    id: "google_gmail",
    group: "Google",
    label: "Gmail",
    description: "Read review notification mail from the business inbox.",
    kind: "oauth2",
    requiredSecrets: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email"],
    docsUrl: "https://developers.google.com/gmail/api/auth/scopes",
    credentialGroup: "google_oauth",
    credentialFields: GOOGLE_OAUTH_FIELDS,
  },
  {
    id: "youtube",
    group: "Google",
    label: "YouTube channel",
    description: "Channel comments and public video feedback.",
    kind: "oauth2",
    requiredSecrets: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    scopes: ["https://www.googleapis.com/auth/youtube.force-ssl", "openid", "email"],
    docsUrl: "https://developers.google.com/youtube/v3/guides/authentication",
    credentialGroup: "google_oauth",
    credentialFields: GOOGLE_OAUTH_FIELDS,
  },
  {
    id: "facebook",
    group: "Meta",
    label: "Facebook Page",
    description: "Page ratings, recommendations and comments.",
    kind: "oauth2",
    requiredSecrets: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    scopes: ["pages_show_list", "pages_read_engagement", "pages_read_user_content", "business_management"],
    docsUrl: "https://developers.facebook.com/docs/graph-api/reference/page/ratings/",
    credentialGroup: "meta",
    credentialFields: META_FIELDS,
  },
  {
    id: "instagram",
    group: "Meta",
    label: "Instagram professional account",
    description: "Comments and mentions on the linked business account.",
    kind: "oauth2",
    requiredSecrets: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    scopes: ["instagram_basic", "instagram_manage_comments", "pages_show_list", "business_management"],
    docsUrl: "https://developers.facebook.com/docs/instagram-api/",
    credentialGroup: "meta",
    credentialFields: META_FIELDS,
  },
  {
    id: "reddit",
    group: "Community",
    label: "Reddit",
    description: "Brand mentions and threads via the Reddit API.",
    kind: "oauth2",
    requiredSecrets: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
    scopes: ["identity", "read", "submit"],
    docsUrl: "https://github.com/reddit-archive/reddit/wiki/OAuth2",
    credentialGroup: "reddit",
    credentialFields: [
      { key: "REDDIT_CLIENT_ID", label: "Client ID", secret: false },
      { key: "REDDIT_CLIENT_SECRET", label: "Client secret", secret: true },
    ],
  },
  {
    id: "twitter",
    group: "Community",
    label: "X (Twitter)",
    description: "Mentions and replies through the X API v2.",
    kind: "oauth2",
    requiredSecrets: ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"],
    scopes: ["tweet.read", "users.read", "offline.access"],
    docsUrl: "https://developer.x.com/en/docs/authentication/oauth-2-0",
    credentialGroup: "twitter",
    credentialFields: [
      { key: "TWITTER_CLIENT_ID", label: "OAuth 2.0 Client ID", secret: false },
      { key: "TWITTER_CLIENT_SECRET", label: "OAuth 2.0 Client secret", secret: true },
    ],
  },
  {
    id: "trustpilot",
    group: "Review sites",
    label: "Trustpilot business profile",
    description: "Service reviews for the verified business unit.",
    kind: "api_key",
    requiredSecrets: ["TRUSTPILOT_API_KEY"],
    scopes: [],
    docsUrl: "https://documentation-apidocumentation.trustpilot.com/",
    accountField: { label: "Business domain", hint: "e.g. seovale.com — used to resolve your Trustpilot business unit." },
    credentialGroup: "trustpilot",
    credentialFields: [{ key: "TRUSTPILOT_API_KEY", label: "API key", secret: true }],
  },
  {
    id: "tripadvisor",
    group: "Review sites",
    label: "Tripadvisor business listing",
    description: "Listing details and review summary via the Content API.",
    kind: "api_key",
    requiredSecrets: ["TRIPADVISOR_API_KEY"],
    scopes: [],
    docsUrl: "https://tripadvisor-content-api.readme.io/reference/overview",
    accountField: { label: "Listing name or location ID", hint: "Exact business name or numeric Tripadvisor location ID." },
    credentialGroup: "tripadvisor",
    credentialFields: [{ key: "TRIPADVISOR_API_KEY", label: "Content API key", secret: true }],
  },
  {
    id: "indeed",
    group: "Employer",
    label: "Indeed employer profile",
    description: "Company reviews on Indeed.",
    kind: "manual",
    requiredSecrets: [],
    scopes: [],
    docsUrl: "https://docs.indeed.com/",
    manualReason:
      "Indeed does not publish a self-serve company-review API. Access requires an approved Indeed partner agreement, so this stays unconnected until credentials are granted.",
  },
  {
    id: "glassdoor",
    group: "Employer",
    label: "Glassdoor employer profile",
    description: "Employer reviews and ratings.",
    kind: "manual",
    requiredSecrets: [],
    scopes: [],
    docsUrl: "https://www.glassdoor.com/developer/index.htm",
    manualReason:
      "Glassdoor closed its public review API; data access is partner-only. No connection can be established without an approved partner key.",
  },
];

export const integrationById = (id: string) => INTEGRATIONS.find((i) => i.id === id);

export const credentialGroupOf = (id: string) => integrationById(id)?.credentialGroup ?? id;

export type IntegrationStatus = "connected" | "disconnected" | "error" | "expired" | "unavailable";
