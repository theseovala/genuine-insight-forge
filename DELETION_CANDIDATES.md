# SEO VALE — Deletion & Destructive Action Candidates

Nothing in this file has been executed. Every entry requires explicit approval
before it is carried out, per the project's no-deletion safety rule.

Last reviewed: 2026-09-21 against commit `05b9bfa` and Supabase project
`yeimgbqwnqdexpfgqppn`.

---

## DB-001 — Name collision blocking all 34 migrations

| Field | Value |
|---|---|
| **ID** | DB-001 |
| **Object** | `public.locations` and `public.review_cases` in Supabase project `yeimgbqwnqdexpfgqppn` |
| **Current purpose** | Neither table belongs to SEO VALE. Their columns (`user_id`, `platform`, `place_id`, `maps_uri`, `rating_count`, `verdict`, `violation_category`, `rejection_risk`…) come from a separate Google-Maps review-removal prototype. |
| **Usage** | None. No SEO VALE migration, server function, component or route references `review_cases`. The SEO VALE migration defines a completely different `locations` table (`name`, `city`, `country`, `manager`, `external_ref`). |
| **Dependencies** | `review_cases.review_cases_location_id_fkey` → `locations`. No other dependants. |
| **Data at risk** | **Zero.** Both tables were verified empty: `select count(*)` returned `0` for each. `auth.users` in this project is also `0`. |
| **Why it blocks** | Migration `20260919162250` runs `CREATE TABLE public.locations (...)` and fails with `relation "locations" already exists`, so none of the 34 migrations can be applied and the target project has no SEO VALE schema at all. |
| **Risk of the proposed action** | LOW |
| **Proposed action** | **Non-destructive schema move**, not a drop: `CREATE SCHEMA IF NOT EXISTS legacy;` then `ALTER TABLE public.review_cases SET SCHEMA legacy;` and `ALTER TABLE public.locations SET SCHEMA legacy;`. Nothing is dropped — table definitions, columns, constraints, indexes, RLS policies and the foreign key all move intact. |
| **Rollback** | `ALTER TABLE legacy.locations SET SCHEMA public; ALTER TABLE legacy.review_cases SET SCHEMA public;` — one command, instant, complete. |
| **Alternatives considered** | (a) `DROP TABLE` — rejected, destructive and unnecessary. (b) Editing the migration to be idempotent — rejected, later migrations depend on the SEO VALE column set, so the collision would only resurface. |
| **Approval status** | **RESOLVED — non-destructively, 2026-09-21.** Authorised by Phase 4 §3. The schema move was executed after pre-flight confirmed both tables held 0 rows. Verified afterwards: `legacy.locations` 12 columns / 2 indexes / 4 policies, `legacy.review_cases` 25 columns / 4 indexes / 4 policies, foreign key `review_cases_location_id_fkey` intact. **Nothing was dropped.** All 34 migrations then applied cleanly. |

---

## DB-002 — Orphaned "Seovale Demo" workspace

| Field | Value |
|---|---|
| **ID** | DB-002 |
| **Object** | Row in `public.workspaces`: `name = 'Seovale Demo'`, `slug = 'seovale-demo'`, `id = 4f63a396-0a09-40b8-adad-0a5c31cc4376` |
| **Origin** | Created by existing migration `20260919173915_1812c5e4…sql`, which runs `INSERT INTO public.workspaces (name, slug) VALUES ('Seovale Demo', 'seovale-demo')`. It is a migration artefact, not data anyone entered. |
| **Usage** | None. `workspace_members` holds **0** rows, so no user belongs to it, and `auth.users` is empty. Every real signup gets its own workspace instead, through the `on_auth_user_created → handle_new_user()` trigger. |
| **Dependencies** | No members, no businesses, no scans, no integrations reference it. |
| **Why flagged** | A workspace literally named "Seovale Demo" is visible in production data and reads as demo/seed content, which the project's data-integrity rule works hard to avoid everywhere else. |
| **Risk of removal** | LOW — but removal is **not** proposed here. |
| **Proposed action** | **None without approval.** Two options when approved: (a) rename it to the real business workspace name and keep the row, which destroys nothing; or (b) delete the row. Option (a) is recommended. |
| **Approval status** | **PENDING** |

---

## Code, routes, components, migrations

**No deletion candidates.** The discovery pass found no dead routes, no unused
components, no duplicated AI infrastructure and no obsolete migrations.
`/integrations` is not dead — it is an intentional redirect to
`/settings?tab=integrations`. Every one of the 76 server functions is reachable
from the UI.

---

## Verification records — REAL DATA, not deletion candidates

These rows were created while verifying the pipeline. Every one holds genuine
measurements from real network requests; none of it is demo, seed or mock data,
and none of it may be deleted without explicit approval.

| Record | Workspace | What it holds |
|---|---|---|
| Scan `7f25db3c-6a69-4623-8995-70bdf1fba9fb` | Seovale Demo | First real scan — score 86, 8 findings, 24 evidence rows, 28 sources |
| Scan `967c6776-8361-41fc-a2dc-af0ba5f61681` | Seovale Demo | AI-failure verification with unusable provider keys |
| Scan `5b56ee17-b42d-48d6-a545-14109138955a` | Seovale Demo | Verified the improved AI error reporting |
| Scan `26f53bb5-d113-4f23-9a81-8f1f9781ec87` | Seovale (test account) | Backed the authenticated CSV export test |
| Scan `83a0e42f-15db-458c-89fe-20c554fd9e81` | Seovale (test account) | Queued row from the RLS write test; never executed |
| User `cloudy-phase4a-test@seovale.com` | — | Test account used for the authenticated flow; its workspace came from the signup trigger |

The account and its two scans exist only for verification, so they are the one
group here that could reasonably be cleaned up later — but only on request.

---

## DB-003 — Seven duplicate index pairs

| Field | Value |
|---|---|
| **ID** | DB-003 |
| **Object** | Index pairs covering identical columns on the same table |
| **Evidence** | Measured on the live database by grouping `pg_index` on `(indrelid, indkey, indclass)`: `business_facts` (`business_facts_workspace_domain_idx` / `idx_business_facts_domain`), `finding_evidence` (`finding_evidence_scan_idx` / `idx_finding_evidence_scan`), `reviews` (`reviews_workspace_external_uidx` / `reviews_workspace_platform_external_key`), `audit_logs` (`audit_logs_ws` / `idx_audit_logs_workspace`), `connected_platforms` (`connected_platforms_workspace_platform_uidx` / `connected_platforms_workspace_platform_key`), `scan_sources` (`scan_sources_scan_idx` / `idx_scan_sources_scan`), `ai_runs` (`ai_runs_workspace_created_idx` / `idx_ai_runs_workspace`) |
| **Reason** | Each pair indexes the same columns twice. Every insert and update maintains both, so writes cost more and storage is wasted, with no read benefit. They accumulated because later migrations added an `idx_`-prefixed index next to one an earlier migration had already created. |
| **Risk** | LOW — but two of the pairs contain a **unique** constraint index (`reviews`, `connected_platforms`). Those enforce data integrity and must be kept; only the redundant non-unique twin may go. |
| **Proposed action** | **None without approval.** When approved, drop only the plain duplicate in each pair, never the unique one, one at a time with a query-plan check after each. |
| **Rollback** | Recreate the index from its definition, captured before any drop. |
| **Status** | **PENDING** |

## DB-004 — Index coverage observation (no action proposed)

60 foreign keys have no supporting index. They were measured, not guessed. The
hot read path was checked against the code first: `getScan` filters
`scan_sources`, `scan_metrics`, `scan_findings`, `scan_reports`, `scan_stages`
and `finding_evidence` by `scan_id`, and `business_facts` / `data_conflicts` by
`domain` — **all of those are already indexed**, several of them twice. The
unindexed keys are `user_id`, `actor`, `granted_by` and similar columns on
licensing and admin tables that no hot query filters on.

Adding 60 indexes would slow every write for no measured benefit, so **no index
is proposed**. This entry exists so the measurement is on record and can be
revisited if a real query pattern emerges.

---

## SEC-001 — `.env` tracked in a public repository

| Field | Value |
|---|---|
| **ID** | SEC-001 |
| **Object** | `.env` at the repository root, tracked since commit `8df9472` |
| **Current contents** | Six variables, all non-secret: `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY` and their `VITE_` duplicates. The publishable key is designed to be public. **No secret is currently exposed.** |
| **Risk** | HIGH going forward. The repository is public (`private: false`, anonymous clone succeeds). The moment a service-role key, provider key or webhook secret is added to this file it is published worldwide. |
| **Proposed action** | `git rm --cached .env` plus a `.env` line in `.gitignore`. This removes the file from future commits while leaving the working copy untouched. |
| **History rewrite** | **Not proposed.** No secret has been committed, so no history rewrite is needed — and rewriting history would break the Lovable sync. |
| **Approval status** | **PENDING** |
