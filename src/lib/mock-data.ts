// Prototype data for RepuVala™ — illustrative only, no live integrations.

export type PlatformId =
  | "google"
  | "facebook"
  | "instagram"
  | "youtube"
  | "trustpilot"
  | "yelp"
  | "tripadvisor";

export const platforms: Record<
  PlatformId,
  { name: string; short: string; color: string; connected: boolean }
> = {
  google: { name: "Google Reviews", short: "G", color: "oklch(0.62 0.18 255)", connected: true },
  facebook: { name: "Facebook", short: "f", color: "oklch(0.5 0.17 260)", connected: true },
  instagram: { name: "Instagram", short: "ig", color: "oklch(0.62 0.22 350)", connected: true },
  youtube: { name: "YouTube", short: "yt", color: "oklch(0.58 0.22 28)", connected: false },
  trustpilot: { name: "Trustpilot", short: "tp", color: "oklch(0.7 0.16 155)", connected: true },
  yelp: { name: "Yelp", short: "y", color: "oklch(0.55 0.22 25)", connected: true },
  tripadvisor: { name: "TripAdvisor", short: "ta", color: "oklch(0.68 0.16 150)", connected: false },
};

export type Sentiment = "positive" | "neutral" | "negative";
export type ReviewStatus = "pending" | "replied" | "escalated" | "flagged";

export interface Location {
  id: string;
  name: string;
  city: string;
  country: string;
  score: number;
  rating: number;
  reviews: number;
  trend: number;
  responseRate: number;
  manager: string;
}

export const locations: Location[] = [
  { id: "all", name: "All locations", city: "Global", country: "", score: 84, rating: 4.5, reviews: 12842, trend: 2.1, responseRate: 91, manager: "—" },
  { id: "mum", name: "Mumbai — Bandra", city: "Mumbai", country: "India", score: 91, rating: 4.7, reviews: 3210, trend: 3.4, responseRate: 97, manager: "Ananya Rao" },
  { id: "dxb", name: "Dubai — Marina", city: "Dubai", country: "UAE", score: 88, rating: 4.6, reviews: 2874, trend: 1.2, responseRate: 94, manager: "Omar Haddad" },
  { id: "lon", name: "London — Soho", city: "London", country: "UK", score: 79, rating: 4.3, reviews: 2416, trend: -1.8, responseRate: 86, manager: "Grace Whitfield" },
  { id: "nyc", name: "New York — Midtown", city: "New York", country: "USA", score: 82, rating: 4.4, reviews: 2190, trend: 0.6, responseRate: 89, manager: "Marcus Bell" },
  { id: "sin", name: "Singapore — Orchard", city: "Singapore", country: "SG", score: 74, rating: 4.1, reviews: 1382, trend: -4.2, responseRate: 78, manager: "Wei Lin Tan" },
  { id: "syd", name: "Sydney — CBD", city: "Sydney", country: "Australia", score: 86, rating: 4.6, reviews: 770, trend: 2.9, responseRate: 93, manager: "Chloe Parker" },
];

export interface Review {
  id: string;
  platform: PlatformId;
  author: string;
  initials: string;
  rating: number;
  sentiment: Sentiment;
  status: ReviewStatus;
  priority: "high" | "medium" | "low";
  location: string;
  date: string;
  title?: string;
  body: string;
  tags: string[];
  unread: boolean;
  reply?: string;
}

export const reviews: Review[] = [
  { id: "r1", platform: "google", author: "Priya Sharma", initials: "PS", rating: 1, sentiment: "negative", status: "pending", priority: "high", location: "Singapore — Orchard", date: "12 min ago", body: "Waited 45 minutes for a table that we had booked in advance. Staff were apologetic but nobody followed up. Very disappointing for a special occasion.", tags: ["Wait time", "Booking"], unread: true },
  { id: "r2", platform: "trustpilot", author: "Daniel Okafor", initials: "DO", rating: 5, sentiment: "positive", status: "pending", priority: "low", location: "London — Soho", date: "38 min ago", title: "Outstanding service", body: "The team went above and beyond. Quick, friendly, and the follow-up email with the invoice was a nice touch. Will recommend to colleagues.", tags: ["Staff", "Service"], unread: true },
  { id: "r3", platform: "yelp", author: "Meera Iyer", initials: "MI", rating: 2, sentiment: "negative", status: "escalated", priority: "high", location: "London — Soho", date: "1 hr ago", body: "Billing error charged me twice. Support said they'd fix it in 48 hours — it's been a week. Frustrated.", tags: ["Billing", "Support"], unread: false },
  { id: "r4", platform: "facebook", author: "Lucas Moreau", initials: "LM", rating: 4, sentiment: "positive", status: "replied", priority: "low", location: "Dubai — Marina", date: "3 hr ago", body: "Great atmosphere and lovely staff. Slightly pricey but worth it for the experience.", tags: ["Ambience", "Pricing"], unread: false, reply: "Thank you Lucas! We're thrilled you enjoyed the experience — see you again soon." },
  { id: "r5", platform: "google", author: "Aisha Khan", initials: "AK", rating: 3, sentiment: "neutral", status: "pending", priority: "medium", location: "Mumbai — Bandra", date: "5 hr ago", body: "Product quality is good, but the app checkout kept failing. Had to call to complete my order.", tags: ["App", "Checkout"], unread: true },
  { id: "r6", platform: "instagram", author: "@travelwithsam", initials: "TS", rating: 5, sentiment: "positive", status: "replied", priority: "low", location: "Sydney — CBD", date: "Yesterday", body: "Obsessed with the new seasonal menu 😍 The rooftop views are unbeatable.", tags: ["Menu", "Ambience"], unread: false, reply: "Thanks Sam! Come back for the sunset session next week 🌇" },
  { id: "r7", platform: "google", author: "Unknown user 4821", initials: "?", rating: 1, sentiment: "negative", status: "flagged", priority: "high", location: "New York — Midtown", date: "Yesterday", body: "Worst place ever. Don't go. [repeated text across 6 accounts in 20 minutes]", tags: ["Suspicious", "Policy review"], unread: false },
  { id: "r8", platform: "trustpilot", author: "Hannah Weiss", initials: "HW", rating: 4, sentiment: "positive", status: "pending", priority: "medium", location: "New York — Midtown", date: "2 days ago", title: "Good, with one gap", body: "Delivery was fast and packaging premium. The size guide was confusing though — I had to exchange once.", tags: ["Delivery", "Size guide"], unread: false },
];

export interface Alert {
  id: string;
  type: "negative" | "drop" | "spike" | "unusual" | "unresolved" | "suspicious";
  severity: "critical" | "high" | "medium" | "info";
  title: string;
  detail: string;
  location: string;
  time: string;
  resolved: boolean;
}

export const alerts: Alert[] = [
  { id: "a1", type: "drop", severity: "critical", title: "Rating dropped 0.4★ in 7 days", detail: "Singapore — Orchard fell from 4.5 to 4.1. Driven by 9 new 1–2★ reviews mentioning wait time.", location: "Singapore — Orchard", time: "14 min ago", resolved: false },
  { id: "a2", type: "negative", severity: "high", title: "New 1★ review on Google", detail: "Priya Sharma — booking not honoured. High-visibility profile (Local Guide, 212 reviews).", location: "Singapore — Orchard", time: "12 min ago", resolved: false },
  { id: "a3", type: "suspicious", severity: "high", title: "Suspicious review burst detected", detail: "6 near-identical 1★ reviews from new accounts within 20 minutes. Recommended: report for policy review.", location: "New York — Midtown", time: "Yesterday", resolved: false },
  { id: "a4", type: "unresolved", severity: "medium", title: "Escalated review unanswered for 72h", detail: "Meera Iyer (Yelp) — billing issue still open. SLA breached.", location: "London — Soho", time: "2 hr ago", resolved: false },
  { id: "a5", type: "spike", severity: "info", title: "Positive review spike", detail: "Mumbai — Bandra received 48 reviews this week (+62%), 92% positive. Seasonal campaign is landing.", location: "Mumbai — Bandra", time: "Today", resolved: false },
  { id: "a6", type: "unusual", severity: "medium", title: "Unusual review volume on Yelp", detail: "London — Soho: review volume 3× the 30-day baseline.", location: "London — Soho", time: "3 days ago", resolved: true },
];

export const ratingTrend = [
  { month: "Mar", rating: 4.28, reviews: 820, score: 76 },
  { month: "Apr", rating: 4.31, reviews: 910, score: 78 },
  { month: "May", rating: 4.36, reviews: 1040, score: 79 },
  { month: "Jun", rating: 4.42, reviews: 1180, score: 81 },
  { month: "Jul", rating: 4.4, reviews: 1260, score: 80 },
  { month: "Aug", rating: 4.47, reviews: 1390, score: 83 },
  { month: "Sep", rating: 4.5, reviews: 1462, score: 84 },
];

export const sentimentTrend = [
  { week: "W1", positive: 68, neutral: 20, negative: 12 },
  { week: "W2", positive: 71, neutral: 18, negative: 11 },
  { week: "W3", positive: 66, neutral: 21, negative: 13 },
  { week: "W4", positive: 74, neutral: 17, negative: 9 },
  { week: "W5", positive: 72, neutral: 18, negative: 10 },
  { week: "W6", positive: 76, neutral: 16, negative: 8 },
];

export const platformPerformance: { id: PlatformId; rating: number; reviews: number; response: number; share: number }[] = [
  { id: "google", rating: 4.6, reviews: 6120, response: 94, share: 48 },
  { id: "facebook", rating: 4.5, reviews: 2210, response: 90, share: 17 },
  { id: "trustpilot", rating: 4.3, reviews: 1840, response: 88, share: 14 },
  { id: "yelp", rating: 4.1, reviews: 1360, response: 81, share: 11 },
  { id: "instagram", rating: 4.8, reviews: 980, response: 72, share: 8 },
  { id: "tripadvisor", rating: 4.4, reviews: 332, response: 65, share: 2 },
];

export const ratingDistribution = [
  { stars: 5, count: 7890 },
  { stars: 4, count: 2860 },
  { stars: 3, count: 1010 },
  { stars: 2, count: 520 },
  { stars: 1, count: 562 },
];

export interface Competitor {
  name: string;
  score: number;
  rating: number;
  reviews: number;
  sentiment: number;
  trend: number;
  responseRate: number;
  you?: boolean;
}

export const competitors: Competitor[] = [
  { name: "Your brand", score: 84, rating: 4.5, reviews: 12842, sentiment: 74, trend: 2.1, responseRate: 91, you: true },
  { name: "Competitor A", score: 88, rating: 4.6, reviews: 18420, sentiment: 78, trend: 0.4, responseRate: 83 },
  { name: "Competitor B", score: 76, rating: 4.2, reviews: 9310, sentiment: 66, trend: -1.9, responseRate: 62 },
  { name: "Competitor C", score: 81, rating: 4.4, reviews: 7640, sentiment: 71, trend: 1.1, responseRate: 74 },
];

export const competitorTrend = [
  { month: "Apr", you: 78, a: 87, b: 79, c: 80 },
  { month: "May", you: 79, a: 88, b: 78, c: 80 },
  { month: "Jun", you: 81, a: 88, b: 77, c: 81 },
  { month: "Jul", you: 80, a: 87, b: 77, c: 80 },
  { month: "Aug", you: 83, a: 88, b: 76, c: 81 },
  { month: "Sep", you: 84, a: 88, b: 76, c: 81 },
];

export const feedbackThemes = [
  { theme: "Staff friendliness", mentions: 1420, sentiment: 92, change: 4, kind: "positive" as const },
  { theme: "Product quality", mentions: 1180, sentiment: 88, change: 2, kind: "positive" as const },
  { theme: "Ambience", mentions: 860, sentiment: 90, change: 6, kind: "positive" as const },
  { theme: "Wait time", mentions: 640, sentiment: 31, change: -9, kind: "negative" as const },
  { theme: "Billing & refunds", mentions: 410, sentiment: 24, change: -5, kind: "negative" as const },
  { theme: "App / checkout", mentions: 385, sentiment: 38, change: -3, kind: "negative" as const },
  { theme: "Pricing", mentions: 520, sentiment: 55, change: 1, kind: "neutral" as const },
  { theme: "Delivery", mentions: 470, sentiment: 79, change: 3, kind: "positive" as const },
];

export interface Role {
  id: string;
  name: string;
  scope: string;
  description: string;
  nav: string[]; // route ids allowed
  focus: string;
}

export const roles: Role[] = [
  { id: "super", name: "Super Admin", scope: "Platform", description: "Full platform oversight across every organization and agency.", nav: ["all"], focus: "Platform health, org onboarding, billing and policy." },
  { id: "owner", name: "Business Owner", scope: "Organization", description: "Executive overview of reputation health and business impact.", nav: ["all"], focus: "Reputation score, trends, competitor standing, reports." },
  { id: "orgadmin", name: "Organization Admin", scope: "Organization", description: "Configures locations, platforms, team and permissions.", nav: ["all"], focus: "Setup, integrations, team and roles." },
  { id: "locmgr", name: "Location Manager", scope: "Single location", description: "Owns one branch's reviews, responses and feedback.", nav: ["dashboard", "reviews", "responses", "alerts", "feedback", "reports"], focus: "Today's reviews, SLA, branch score." },
  { id: "repmgr", name: "Reputation Manager", scope: "Organization", description: "Drives monitoring, prioritisation and response quality.", nav: ["dashboard", "reviews", "responses", "analytics", "alerts", "locations", "competitors", "feedback", "reports"], focus: "Alerts, response queue, sentiment, escalations." },
  { id: "agent", name: "Customer Support Agent", scope: "Assigned queue", description: "Responds to assigned reviews and feedback.", nav: ["dashboard", "reviews", "responses", "feedback"], focus: "Response queue, templates, SLA timers." },
  { id: "marketing", name: "Marketing Manager", scope: "Organization", description: "Turns positive reputation into growth and campaigns.", nav: ["dashboard", "reviews", "analytics", "competitors", "feedback", "reports"], focus: "Positive spikes, testimonials, campaign impact." },
  { id: "analyst", name: "Analyst", scope: "Organization", description: "Deep-dives into trends, drivers and location comparisons.", nav: ["dashboard", "analytics", "locations", "competitors", "feedback", "reports"], focus: "Trends, drivers, exports, benchmarks." },
  { id: "agencymgr", name: "Agency Manager", scope: "Multi-client", description: "Manages many client brands from one workspace.", nav: ["all"], focus: "Client portfolio health, SLAs, white-label reports." },
  { id: "agencystaff", name: "Agency Staff", scope: "Assigned clients", description: "Executes monitoring and responses for assigned clients.", nav: ["dashboard", "reviews", "responses", "alerts", "feedback", "reports"], focus: "Client queues and daily response work." },
];

export const teamMembers = [
  { name: "Rohan Mehta", email: "rohan@repuvala.example", role: "Business Owner", locations: "All", status: "Active" },
  { name: "Ananya Rao", email: "ananya@repuvala.example", role: "Location Manager", locations: "Mumbai — Bandra", status: "Active" },
  { name: "Grace Whitfield", email: "grace@repuvala.example", role: "Reputation Manager", locations: "UK & EU", status: "Active" },
  { name: "Tom Alvarez", email: "tom@repuvala.example", role: "Customer Support Agent", locations: "New York — Midtown", status: "Invited" },
  { name: "Sana Qureshi", email: "sana@agency.example", role: "Agency Staff", locations: "3 clients", status: "Active" },
];

export const activity = [
  { who: "Grace Whitfield", what: "replied to", target: "Lucas Moreau (Facebook)", time: "3 hr ago" },
  { who: "System", what: "flagged", target: "6 suspicious reviews — NYC", time: "Yesterday" },
  { who: "Ananya Rao", what: "resolved alert", target: "Positive spike — Mumbai", time: "Yesterday" },
  { who: "Omar Haddad", what: "escalated", target: "Meera Iyer (Yelp)", time: "2 days ago" },
  { who: "Rohan Mehta", what: "exported", target: "Monthly Reputation Report", time: "3 days ago" },
];
