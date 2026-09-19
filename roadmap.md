# Seovale — build roadmap

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
  - [x] Security lint clean (only the intentionally locked credential store is flagged)
- [ ] Google Business Profile connection flow (blocked: needs the user's OAuth client ID + secret)
