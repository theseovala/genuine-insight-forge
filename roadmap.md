# Seovale — build roadmap

- [x] STRICT DATA INTEGRITY: remove all seeded/demo/fake records and reports; show only verified live-source data and honest empty states
- [x] Audit every screen and metric so no placeholder, synthetic, or unverified claim is presented as real

- [x] Locked rule: preserve the original Seovale UI/UX for every future file; import useful functionality only
- [x] Review `orbitrep_1.zip` for feature-only reuse (no application source or reusable features were included)
- [x] Copy the RepuVala command center app into this project
- [x] Real backend schema (reviews, alerts, locations, platforms, competitors, reports, brand settings, profiles)
- [x] Remove the previously seeded review history, locations, alerts, competitors, reports, and derived scans/audits
- [x] Email sign-up / sign-in enabled
- [x] Rebrand everything to Seovale (titles, shell, footer, copy)
- [x] Remove mock data; every page reads stored data
- [x] Real auth flow: public landing at /, /auth sign-in + sign-up, app behind an authenticated layout
- [x] Real AI (Lovable AI Gateway): reply writing, review analysis, report summaries
- [ ] Deep end-to-end recheck of every page, action and number after fake-data cleanup
  - [x] Feedback theme trends only shown when there is enough data to compare
  - [x] Publish reply, resolve alert, settings save and report generation all verified writing to the backend
  - [x] AI reply writing, feedback briefing and report writing verified live
- [x] Security lint clean, including an explicit deny policy on the server-only credential store
- [x] Workspace and membership isolation across all business data
- [x] Google Business Profile OAuth, encrypted tokens, paginated sync, sync history and review alerts
- [x] AI activity audit records for generated replies, briefings and reports
- [x] Branded PDF report downloads
- [x] Password recovery and secure password update
- [x] Configurable alert thresholds and real response-time analytics
- [ ] Live Google authorization verification (credentials configured; awaiting account approval after top-level authorization fix)
## Open tasks
- [x] Fixed signup 'Database error saving new user' (dropped global connected_platforms platform unique, added per-workspace unique)
- [x] Created account for theseovala@gmail.com (owner of new Seovale workspace; email confirmation pending)
- [x] Custom domain seovale.com connected (DNS verified, provisioning); published to Lovable URL
- [x] theseovala@gmail.com now owner of the main workspace; empty duplicate workspace removed
- [x] Live verified: alert engine fires, AI reply drafted+published (replied_by recorded), PDF download, platforms list

## New task (VPS)
- User shared a Hostinger VPS (187.53.134.164) and asked to deploy there. SSH password was pasted in chat — advise rotation. Lovable hosting already serves the app; evaluate safe use.
- Done: Review Removal (auto AI policy scan, removal_cases/removal_scans, page + nav). Claude + OpenAI keys wired as AI fallbacks.
- [ ] Move all Lovable Cloud (Supabase) data + schema to user's self-hosted Supabase on Hostinger VPS (187.53.134.164), keep app working (evaluate: code env vars, auth, RLS, migrations). Blocked on: VPS Supabase URL + keys (service role), and decision whether to keep Lovable Cloud or fully switch.
- [ ] Complete Google authorization: real credentials are saved; Google-side Business Profile API/account approval still blocks the connection.

- [x] Review Removal priority: flagged cases include AI appeal replies; Google-origin replies post to Google when connected, otherwise remain saved on the review

- [x] Automatic review-removal scan schedule (interval + batch size per workspace, hourly scheduler, single-flight lease, pause on credit/access failure)
- [x] Zero-review dashboard shows real data unavailable, without derived percentages or misleading actions
- [x] Create immediate in-app alerts for every newly synced or updated real negative review, without duplicates
- [x] Automatically draft a response when a real review is opened and provide one-click copy for Google

## Third-party integration infrastructure (2026-09-20)
- [x] Encrypted, service-role-only connection storage (`integration_connections`), OAuth state table, and activity log (`integration_events`)
- [x] Shared OAuth callback `/api/public/integrations/callback` with PKCE (Google, X), Meta long-lived token exchange, Reddit basic auth
- [x] Server functions: list, start OAuth, save business reference, live Test connection, token refresh, disconnect
- [x] Integration Manager UI (Settings → Integration manager) with Connected / Disconnected / Error / Expired / Unavailable status and activity log
- [x] Indeed & Glassdoor marked Unavailable (partner-only APIs) — no fake connection
- [ ] Waiting on credentials: GOOGLE_OAUTH_CLIENT_SECRET, FACEBOOK_APP_ID/SECRET, REDDIT_CLIENT_ID/SECRET, TWITTER_CLIENT_ID/SECRET, TRUSTPILOT_API_KEY, TRIPADVISOR_API_KEY
- [ ] Rotate previously exposed credentials (Google client secret, Hostinger password)

## Master Integration Center (requested 2026-09-20)
- [x] Test Connection runs a real provider request for every configured platform; dashboard shows Connected / Disconnected / Error / Expired / Unavailable
- [ ] Expand provider registry to the full requested catalogue (Google suite, Meta/WhatsApp, reputation, SEO, website intelligence, AI, communication, payments) with per-provider adapters
- [ ] Richer test result codes (AUTHENTICATION_FAILED, INSUFFICIENT_SCOPE, RATE_LIMITED, APPROVAL_REQUIRED, NOT_CONFIGURED, UNAVAILABLE ...)
- [ ] Provider-specific credential fields (account/business/page/project IDs, webhook secrets) stored encrypted server-side
- [ ] Webhook endpoints with signature verification, idempotency and replay protection
- [ ] Sync jobs / API usage / rate-limit / health tables sourced only from real provider responses ("Not provided by API" otherwise)
- [ ] Integration overview dashboard: health, sync, webhook, usage, errors, audit log
- [ ] Agency/client/business role isolation beyond the current workspace RLS
- [x] Secure provider configuration panel: encrypted per-provider credential vault (integration_provider_credentials, service-role only), masked display, rotate, revoke, real server-side validation + live provider test, audit events (2026-09-20)

## Enterprise backend foundation (requested 2026-09-21)
- [x] Full provider catalogue (26 providers: Google suite, Meta/WhatsApp, reputation, SEO, AI, communication, payments) with per-provider credential schemas and honest approval/partner-only states
- [x] Standardized outcome codes (CONNECTED, NOT_CONFIGURED, INVALID_CREDENTIALS, AUTHENTICATION_FAILED, INSUFFICIENT_SCOPE, RATE_LIMITED, PROVIDER_ERROR, APPROVAL_REQUIRED, TOKEN_EXPIRED, UNAVAILABLE) returned by every live test
- [x] Real live-test endpoint per new api_key provider (Maps, WhatsApp, Yelp, Semrush, Ahrefs, Moz, DataForSEO, OpenAI, Resend, Twilio, Stripe, Razorpay) + OAuth entries for Pinterest, Search Console, GA4, Google Ads
- [x] Production tables: integration_sync_jobs, integration_webhook_events, integration_api_logs, integration_usage, integration_rate_limits, integration_health, audit_logs (RLS + grants + workspace isolation)
- [x] Durable job queue with lease, exponential backoff, dead-letter and idempotency; hourly retry backstop cron (fresh webhooks processed inline on arrival)
- [x] Webhook receiver /api/public/integrations/webhook with signature verification (Meta/X/Trustpilot), subscription handshake, replay protection and workspace resolution
- [x] Health + API log recording on every connection test (integration_health, integration_api_logs)
- [x] Architecture documentation at docs/ARCHITECTURE.md (ERD, security, OAuth, webhook, queue, AI, failure handling, testing)
- [ ] Integration overview dashboard panel reading health/usage/rate limits/errors from the new tables
- [ ] Provider-specific usage/rate-limit extraction from real provider response headers during sync

## In progress (added 20:11 UTC)
- [x] Ultra Premium UI enhancement (done 20:2x UTC — depth tokens, bg-ambient, edge illumination, sidebar active glow, premium gradient buttons, dark-mode depth; verified desktop, 0 overflow, 0 console errors) — keep palette/fonts/layout/spacing; add depth layers, glow, card sheen, premium buttons, sidebar active glow, density, micro-animations, reduced-motion support. Inspect every major screen after.
- [x] Review Center: real-time sync (Realtime on reviews/alerts + Trustpilot sync fn + Sync live reviews button) — live reviews appear once Google OAuth approved and Trustpilot key saved (user action pending)

## Integration foundation lock + AI scan intelligence (requested 2026-09-21)
- [x] Scan engine layer separation: raw (scan_sources/provider_raw_data) → normalized (scan_metrics) → analysis (scan_findings) → report (scan_reports) → CSV
- [x] Evidence engine: every finding carries severity, impact, recommendation, source, evidence object and timestamp
- [x] Scan health panel: every source with status, honest NOT_CONFIGURED and freshness (fresh/stale/expired/unavailable)
- [x] Incremental scanning + resume from stored sources; hourly backstop recovers stuck scans with attempt limits
- [x] Historical comparison against the previous completed scan (resolved / new / unchanged)
- [x] One-click Re-scan reusing the stored URL without duplicating the business record
- [x] Non-blocking scans: the browser polls stored status instead of waiting on the request
- [x] Data lifecycle: delete a scan and all derived layers, with an audit record
- [x] Architecture documentation for the scan flow in docs/ARCHITECTURE.md
- [ ] Cross-source verification + duplicate detection (needs Google Business / Meta access — blocked on provider approval)
- [ ] Provider-sourced usage/rate-limit extraction during sync
- [ ] Ultra Premium pass 3: apply the existing depth/glow/density language to the new Scan Engine screen (palette, fonts, layout unchanged)
