# Seovale production upgrade plan

## Goal
Keep Seovale’s current interface and reputation-management workflow unchanged, while bringing across only the uploaded project’s production-grade capabilities that fit Seovale.

## Build

### 1. Secure customer workspaces
- Add a workspace and membership model so each customer sees only their own brand, locations, reviews, alerts, competitors, reports, and platform connections.
- Move the current realistic seed dataset into one demo workspace without changing the visible demo.
- Create an empty Seovale workspace automatically for each new account.
- Replace broad signed-in access rules with workspace-scoped access rules.

### 2. Real Google Business Profile connection foundation
- Add secure Google authorization with expiring one-time state, PKCE, encrypted token storage, refresh handling, disconnect, and reconnect states.
- Add the callback endpoint and connect/sync controls inside Seovale’s existing Connected Platforms area.
- Sync authorized Google locations and reviews into Seovale’s existing location/review records with stable external IDs and deduplication.
- Do not display a fake connected state. Until approved Google credentials are supplied, the UI will clearly show that setup is required.

### 3. Reliable review ingestion and alerts
- Add an idempotent sync run/history record so sync failures, retries, counts, and last successful sync are real and inspectable.
- Generate real alerts from newly imported reviews: new negative reviews, unanswered negative reviews, rating drops, and unusual volume.
- Make the existing Alert Rules control functional with stored thresholds instead of leaving it as a dead button.

### 4. Production AI traceability
- Record each AI reply, feedback briefing, and report run with purpose, model, input fingerprint, completion status, duration, and output.
- Keep the current live model and existing Seovale prompts; no mock AI or alternate model.
- Preserve user review before publishing any AI-written public reply.

### 5. Downloadable reports
- Turn each saved Seovale report into a real branded PDF generated on demand.
- Add download controls in the existing report library without redesigning the page.
- Keep all figures derived from the selected workspace’s stored reviews.

### 6. Complete account recovery
- Add “Forgot password” to the existing sign-in screen.
- Add a Seovale-styled reset-password page with expired-link and password validation states.

### 7. Correctness and end-to-end verification
- Fix the response-performance chart so it displays actual reply-time data rather than review volume.
- Verify sign-up/sign-in/recovery, workspace isolation, Google setup states, review writes, alert rules, AI actions, report creation, and PDF download.
- Run security checks and verify desktop/mobile behavior without changing Seovale’s visual design.

## Not importing
- Review-removal cases, policy-violation scanning, appeals, public case boards, bulk removal queues, blog/CMS, contact inbox, or the uploaded project’s UI/branding.
- These belong to a different product or do not improve Seovale’s core reputation workflow.

## External requirement
Google review sync can be fully wired and safely inactive, but the first real authorization requires your approved Google Business Profile client ID and client secret.
