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
