# Seovale — build roadmap

- [x] Locked rule: preserve the original Seovale UI/UX for every future file; import useful functionality only
- [x] Review `orbitrep_1.zip` for feature-only reuse (no application source or reusable features were included)
- [x] Copy the RepuVala command center app into this project
- [x] Real backend schema (reviews, alerts, locations, platforms, competitors, reports, brand settings, profiles)
- [x] Realistic seeded review history (260 reviews, 6 locations, 6 platforms, 12 months)
- [x] Email sign-up / sign-in enabled
- [x] Rebrand everything to Seovale (titles, shell, footer, copy)
- [x] Remove mock data; every page reads stored data
- [x] Real auth flow: public landing at /, /auth sign-in + sign-up, app behind an authenticated layout
- [x] Real AI (Lovable AI Gateway): reply writing, review analysis, report summaries
- [x] Deep end-to-end recheck of every page, action and number
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
- [ ] Live Google authorization verification (blocked: needs approved OAuth client ID and secret)
## Open tasks
- [x] Fixed signup 'Database error saving new user' (dropped global connected_platforms platform unique, added per-workspace unique)
- [x] Created account for theseovala@gmail.com (owner of new Seovale workspace; email confirmation pending)
- [x] Custom domain seovale.com connected (DNS verified, provisioning); published to Lovable URL
- [x] theseovala@gmail.com now owner of the main workspace; empty duplicate workspace removed
- [x] Live verified: alert engine fires, AI reply drafted+published (replied_by recorded), PDF download, platforms list

## New task (VPS)
- User shared a Hostinger VPS (187.53.134.164) and asked to deploy there. SSH password was pasted in chat — advise rotation. Lovable hosting already serves the app; evaluate safe use.
- Done: Review Removal (auto AI policy scan, removal_cases/removal_scans, page + nav). Claude + OpenAI keys wired as AI fallbacks.
