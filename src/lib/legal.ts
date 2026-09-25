// Company and legal facts used by the Privacy Policy, the Terms and the in-app
// disclosures. Nothing here is invented: a value that has not been supplied by
// the business owner stays `null`, and the pages render it as a clearly marked
// "to be provided" placeholder instead of a made-up name, address or email.
import { BRAND } from "@/lib/domain";

export type LegalFactKey =
  | "companyLegalName"
  | "registeredAddress"
  | "registrationNumber"
  | "privacyEmail"
  | "supportEmail"
  | "dpoContact"
  | "euRepresentative"
  | "ukRepresentative"
  | "indiaGrievanceOfficer"
  | "governingLaw"
  | "disputeResolution"
  | "refundPolicy"
  | "hostingRegions"
  | "minimumAge";

/** What each value is, shown inside the placeholder so the owner knows what to supply. */
export const LEGAL_FACT_LABELS: Record<LegalFactKey, string> = {
  companyLegalName: "Registered legal name of the company that operates Seovale",
  registeredAddress: "Registered office address",
  registrationNumber: "Company / corporate registration number",
  privacyEmail: "Privacy contact email address",
  supportEmail: "General support email address",
  dpoContact: "Data Protection Officer name and contact (if one is appointed)",
  euRepresentative: "EU representative under GDPR Article 27 (if required)",
  ukRepresentative: "UK representative under UK GDPR Article 27 (if required)",
  indiaGrievanceOfficer: "India grievance officer / DPDP contact (if required)",
  governingLaw: "Governing law (country / state)",
  disputeResolution: "Courts or arbitration body and seat for disputes",
  refundPolicy: "Actual cancellation and refund policy",
  hostingRegions: "Countries / regions where data is hosted",
  minimumAge: "Minimum age to use the service",
};

export const LEGAL = {
  /** Version stamp recorded with every consent. Change it whenever either document changes materially. */
  version: "2026-09-25",
  lastUpdated: "25 September 2026",
  /** Date the documents take effect. `null` until the owner publishes them. */
  effectiveDate: null as string | null,
  tradingName: BRAND.name,
  website: "https://seovale.com",
  facts: {
    companyLegalName: null,
    registeredAddress: null,
    registrationNumber: null,
    privacyEmail: null,
    supportEmail: null,
    dpoContact: null,
    euRepresentative: null,
    ukRepresentative: null,
    indiaGrievanceOfficer: null,
    governingLaw: null,
    disputeResolution: null,
    refundPolicy: null,
    hostingRegions: null,
    minimumAge: null,
  } as Record<LegalFactKey, string | null>,
  /**
   * Google Business Profile API policies limit stored Business Profile content to
   * 30 calendar days. Set to true only once an automatic purge/refresh actually
   * enforces that limit; the Privacy Policy states the current behaviour either way.
   */
  googleBusinessRetentionEnforced: false,
} as const;

export const missingLegalFacts = (): LegalFactKey[] =>
  (Object.keys(LEGAL.facts) as LegalFactKey[]).filter((key) => !LEGAL.facts[key]);

/** Versions of the disclosure shown before Google authorization, recorded with the consent. */
export const GOOGLE_DISCLOSURE_VERSION = "google-oauth-2026-09-25";

/** Scopes requested by the Google Business Profile connection (see google-business.server.ts). */
export const GOOGLE_BUSINESS_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "openid",
  "email",
] as const;

/** Google OAuth scopes and what the product uses each for, shown before authorization. */
export const GOOGLE_SCOPE_PURPOSES: Record<string, { label: string; purpose: string }> = {
  "https://www.googleapis.com/auth/business.manage": {
    label: "Manage your Google Business Profile",
    purpose:
      "List the business accounts and locations you manage, read their reviews, and post a review reply only when you press Publish.",
  },
  "https://www.googleapis.com/auth/webmasters.readonly": {
    label: "View Search Console data",
    purpose: "Read search performance for the sites you choose, for reports and alerts.",
  },
  "https://www.googleapis.com/auth/analytics.readonly": {
    label: "View Google Analytics data",
    purpose: "Read traffic figures for the properties you choose, for reports.",
  },
  "https://www.googleapis.com/auth/adwords": {
    label: "Google Ads access",
    purpose: "Read campaign data for the accounts you choose, for reports.",
  },
  "https://www.googleapis.com/auth/gmail.readonly": {
    label: "Read Gmail messages",
    purpose: "Find review and reputation notifications in the mailbox you connect.",
  },
  "https://www.googleapis.com/auth/youtube.force-ssl": {
    label: "Manage your YouTube account",
    purpose: "Read comments on your channel's videos and reply only when you choose to.",
  },
  "https://www.googleapis.com/auth/yt-analytics.readonly": {
    label: "View YouTube Analytics",
    purpose: "Read channel performance figures for reports.",
  },
  openid: {
    label: "Sign-in identity",
    purpose: "Confirm which Google account authorized the connection.",
  },
  email: {
    label: "Email address",
    purpose: "Show which Google account is connected so you can recognise it.",
  },
};
