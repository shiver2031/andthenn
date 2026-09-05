# CRM audit implementation progress — 4 September 2026

This is a progress addendum to `crm-flow-implementation-audit-2026-09-03.md`, not a replacement for its findings or release gates. Existing workspace changes have been preserved. Timelines were not used to select work; stop-ship boundaries and the accountable task/Client journey took precedence.

## Earlier implementation pass

- **CRM-001:** Added a real PostgreSQL integration test using the production Drizzle journal migrator: upgrade through 0011 to 0012, clean installation, replay, terminal-versus-phase backfill, preservation of Manager roles, tenant guards, and completion-shape constraints. Readiness now checks the required CRM schema and production migration journal. Embedded PostgreSQL substitutes the unavailable PGMQ extension only; this does not certify hosted PGMQ or production deployment.
- **CRM-002 / CRM-011:** Centralized project/task/file read checks, including active membership and both Client lineage and project grants. Added an authenticated file-byte endpoint that rechecks authorization on every request, including exact active review shares for previews. Current final-file access requires an active approval; immutable historical bytes do not become current finals after approval reopening. Added malformed-ID handling, assignment-query grouping, scoped project child resources, and review-share/task identity validation during revocation.
- **CRM-003:** Separated operational `clients:manage` from finance permissions. Managers can maintain clients without an Accounts grant; Designer/Client denial remains in place.
- **CRM-004:** Added completion withdrawal and leadership task reopening with required reason, optimistic version checks, approval history preservation, and rollup reset. Fallback reviewer selection excludes expired/future memberships; takeover confirmation requires a reason. Completed tasks and pending completion requests cannot silently change phase. Approval reopening now rejects stale task versions and clears project completion time.
- **CRM-005 / CRM-006:** Added pending/success/error task command controls and tightened mention choices and server validation to active internal recipients who already have task access. Self-only mentions no longer generate an empty notification insert. Assignment, discussion, notification, block/status, request/withdraw/confirm/reopen persistence is exercised through the browser.
- **CRM-007:** Added authenticated Client preview, approval, and changes-request forms with inline validation and stale-write checks. Decisions are audited and notify assignees; approval locks the version but does not complete the task. Client Home now lists pending shared reviews and deep-links to the project decision panel. Superseded review selections are excluded. Project and Files pages expose authenticated current-final downloads.
- **Acceptance infrastructure:** Added actual review media to isolated acceptance storage, removed an intake test's fixed count assumption across sequential browser projects, serialized shared seed mutations, and added mobile WebKit coverage. The acceptance run still shares one database across browser projects; this is not per-worker database isolation.

The existing routing/UI skills informed accessible labels, touch-sized controls, visible command outcomes, and canonical project links. Mobile Client review screenshots were inspected; the review card, media, feedback form, and project sections remain within the viewport.

## Verification

- `pnpm check:fast`: lint, typecheck, 39 unit/integration tests, and production build passed. Lint retains three existing console warnings, with no errors.
- Final expanded browser suite: **52/52 passed in 56.5 seconds**, across Chromium and WebKit at 375px and 1440px, including Client Home queue navigation and removal after approval. Retries were disabled. Earlier failures exposed missing fixture bytes, immutable-lock updates, and outdated test selectors; those were corrected before this passing run.
- Migration tests execute real CRM SQL with temporary PostgreSQL; the production PGMQ extension and provider configuration are not covered.
- `git diff --check`: passed.

## Remaining work recorded after the earlier pass (superseded below)

| Audit marker | Remaining requirement / evidence |
| --- | --- |
| CRM-001 | Run the unchanged migrations and readiness checks on organization-owned staging with the real PGMQ extension and production image. |
| CRM-002 | Extend negative tests to the complete cross-organization page/action/API/export matrix, grant revocation and temporary expiry during open sessions. Current coverage is not an exhaustive IDOR certification. |
| CRM-003 | Obtain production role mapping and named finance grants; validate the full granted-Manager finance matrix. |
| CRM-004 | Exercise simultaneous commands, reassignment during review, inactive-reviewer fallback, media-task completion and approval reopening as a comprehensive browser matrix. The new text-task path is covered. |
| CRM-005 | Product decision on standalone tasks remains required; current tasks retain project/output lineage. |
| CRM-006 | Complete full internal review changes/new-version/approval journey and lost-access mention behavior. Existing commands and UI are not equivalent to full journey evidence. |
| CRM-007 | Complete invite/grant/revocation operations and approved production Client grants. Automated coverage proves two isolated seeded Clients, decisions, preview bytes and current finals. |
| CRM-008 | Independently exercise every wizard edit, autosave, conflict and Save/Discard/Stay path; prior implementation was retained, not certified wholesale here. |
| CRM-009 | Consolidate all attention reasons into one shared, role-scoped, deduplicated read model and prove Home/Work reconciliation. |
| CRM-010 | Validate Team load against date-window/capacity exceptions and assignment estimates; a visible window alone does not prove scheduling math. |
| CRM-011 | Expand upload/processing/failure, filter, revocation and historical-version coverage beyond the current approved/download path. |
| CRM-012 | Expense correction/editing and finance-owner approval of recognition, currency, tax and gross-profit definitions remain. Current Accounts is operational reporting, not an accounting ledger. |
| CRM-013 | Complete brand/workspace editing and full final-delivery, output closure and project closure acceptance. |
| CRM-014 | Complete every authorized search source, stale notification link and lost-access scenario. |

## Earlier release boundary (superseded below)

The audit's complete clean-seed brief → project → internal changes → new upload → internal approval → Client changes → new upload → Client approval → delivery → confirmed task/output/project closure journey is **not yet proven**. Passing the current suite must not be represented as passing that entire journey.

Production platform ownership, membership mapping, Client and finance grants, standalone-task scope, retention/privacy decisions, provider sandbox tests, backup/recovery drills, representative performance measurement, accessibility matrix, and Founder/Manager/Designer/Client UAT remain release gates. No deployment, provider mutation, production role promotion, or production data reset was performed. Production approval remains **NO-GO** until the audit gates are evidenced and signed off.

## Follow-up implementation: golden journey and supporting areas

- **CRM-004 / 006 / 007 / 013:** Implemented and exercised the full local clean-seed brief → setup → project → internal feedback → new version → internal approval → Client changes → third version → Client approval → authenticated final download → task confirmation → output confirmation → verified archive → project closure journey. This uses actual upload bytes and the running worker, not mocked processing responses. File approval remains nonterminal. Shared setup phases now match execution phases; phase forms expose pending/error/success feedback.
- **Worker blockers:** Fixed the queue-health integer-seconds query and the archive DISTINCT/ORDER BY mismatch uncovered by real processing. PGMQ documents `oldest_msg_age_sec` as integer seconds ([official SQL function reference](https://pgmq.github.io/pgmq/api/sql/functions/)). Prototype processing permits only the exact bundled fixture checksum; arbitrary files still require the configured inspection service.
- **CRM-002 / 004:** Added parent-project locking to task status/completion/reopening/editing and file approval paths. Project closure validates and updates within one locked transaction; checklist changes now take the same lock and reject closed projects. Browser coverage proves concurrent stale task editors cannot both win. Completed outputs/projects are excluded from task creation and rejected server-side. This is expanded coverage, not an exhaustive concurrency proof.
- **CRM-007:** Added scoped grant/revoke controls for already-linked Client memberships. The golden journey verifies revocation takes effect in an already-open Client session. Guest review links remain a separate boundary; production account provisioning is not automated.
- **CRM-008:** Fixed initial wizard draft identity churn, repeated failed autosave retries, and incomplete draft saving without a selected client. Activation remains strict. Setup assignments now exclude Client, expired and future memberships.
- **CRM-009 / 010:** Added a shared deduplicated attention-reason model for Home/Work and tests for terminal/reminder behavior. Team capacity uses a defined seven-day UTC window, schedule changes, capacity exceptions and deduplicated assignments; overdue work remains included and future tasks excluded. Five new focused unit tests cover attention and load behavior.
- **CRM-012 / 013:** Added audited client/brand/contact maintenance and expense corrections with stale-version rejection and required correction reasons. Browser coverage verifies durable brand edits, corrected expenses, stale expense rejection and Designer finance denial. Operational project closeout is available to Managers without finance grants.
- **Release controls:** Added `pnpm release:gate`, a pending approval manifest, and [production release instructions](production-release-approval-guide.md). The gate checks the exact release commit, clean checkout, named approval, timestamp and evidence for each required decision. It does not authenticate signatures or control external deployers. No approvals were fabricated.

The routing, UI primitive and design-token skills informed labelled controls, explicit save outcomes, touch-sized buttons and stable high-contrast button colors. Desktop completed-project and mobile Accounts screenshots were visually inspected.

### Follow-up verification

- `pnpm check:fast`: passed lint, typecheck, **44 unit/integration tests**, and production build. Existing console warnings remain; no lint errors.
- Expanded browser regression: **58 passed, 6 intentionally skipped**, in 1.8 minutes, with retries disabled. Chromium/WebKit desktop and mobile execute the shared route, permission and concurrency suite. Golden and supporting-data mutation journeys each run once in desktop Chromium; their other three browser variants are intentionally skipped.
- Earlier failures revealed closed-project task options and transitional button contrast; both were corrected before the passing regression.
- After the final checklist/project locking change, the production build and targeted golden journey passed again (one executed journey; three intentional browser-project skips). `git diff --check` passed. The pending release manifest correctly makes `pnpm release:gate` exit with status 1.
- Quality CI now runs prototype acceptance and retains failure artifacts. Remote CI has not been executed in this session.

### Remaining production and coverage gates

The full golden journey is now **proven locally**, not certified on production providers. Production remains **NO-GO** pending organization-owned staging, unchanged migrations with real PGMQ, scanner/provider sandbox evidence, restore/performance/accessibility evidence, role/finance/privacy/product decisions and named persona UAT approvals. See the approval packet for owners and required evidence.

Further exhaustive test coverage remains: the complete cross-organization action/API/export matrix; temporary expiry mid-session; every wizard conflict/Save/Discard/Stay path; lost-access mentions/search/notifications; all media failure and historical-version cases; and reassignment/reviewer fallback plus all reopen/archive/concurrent-command combinations. These must not be inferred from the passing subset. Standalone tasks still require a product decision and retain project/output lineage. Accounts remains operational reporting, not an accounting ledger.
