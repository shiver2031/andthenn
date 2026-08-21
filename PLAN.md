# AndThenn ERP Complete Implementation Master Plan

## Summary

Deliver the ERP in seven gated phases, converting the current static showcase into a secure, persisted, auditable production system. Each phase ends with automated acceptance, a production-like staging deployment, and an internal pilot. Formal release occurs only after all 101 PRD requirements, 12 critical scenarios, and 10 release gates pass.

### Locked decisions

- Supabase Auth/PostgreSQL/S3, Google Cloud Run/Gmail/AI, Meta WhatsApp and PGMQ remain the provider baseline.
- Managers and permanent employees use Google Workspace authentication.
- Temporary freelancers use manager-created email/password accounts.
- Production starts clean; no legacy-data import is required.
- Retention is configurable, but destructive jobs and production launch remain blocked until AndThenn approves the durations.
- The existing light-first ERP theme and dark control-room/review theme remain.
- Internal pilots occur after major vertical slices.
- Beyond-PRD enhancements are integrated into their related subsystem phases.
- Google Calendar is the only additional team integration.
- Quotations use native secure no-login acceptance links.

## Master Roadmap

| Phase | Outcome | PRD coverage | Added recommendations | Exit gate |
|---|---|---|---|---|
| 1. Secure foundation | Authenticated, organization-scoped system foundation | IAM, security, audit, infrastructure | — | All IAM P0 tests pass; no production demo/fail-open path |
| 2. Core operations | Clients, projects, deliverables, tasks, workflow, time and workload operate end-to-end | CLT, PRJ, DLV, TSK, WFL, TME | Templates, cloning, what-if capacity planning | Task-accountability, custom-workflow and workload scenarios pass |
| 3. Intake and activation | Requests reliably become proposals, projects or existing-project tasks | INT, PRP, activation | Offline/PWA capture | Email-to-project and WhatsApp scenarios pass |
| 4. Files and review | Immutable media delivery and client feedback work across four formats | FIL, RVW | Rights/releases, review intelligence | Version-pinning and feedback-cycle scenarios pass |
| 5. Commercials and closure | Quotes, acceptance, invoices, approvals, closure and archive operate | FIN, closure rules | Native quote acceptance, retrospectives | Quotation and closure scenarios pass |
| 6. Operational control | Dashboards, search, notifications, reporting, administration and integrations work | OPS | Google Calendar integration | All operational controls persist, link and export correctly |
| 7. Hardening and launch | Security, accessibility, recovery, performance, UAT and handover are complete | All release gates | Production-readiness improvements | 101/101 requirements, 12/12 scenarios and 10/10 gates pass |

## Public Interfaces and Architectural Changes

- Introduce a central `ActorContext` containing authenticated user, membership, organization, role, account type, assignment scope and session-revocation state.
- Route all internal writes through domain command services invoked by Next.js Server Actions. Public review, uploads, webhooks and external callbacks remain versioned API routes.
- Require organization-scoped repositories, server authorization and PostgreSQL row-level/security constraints on every operational object.
- Use optimistic concurrency versions for mutable records and append-only audit events for every material change.
- Standardize domain events and transactional outbox delivery for intake, workflow, feedback, approval, notifications, archive and integration synchronization.
- Expand public boundaries for:
  - multipart uploads and completion;
  - reviewer identity, comments, annotations and view receipts;
  - version-pinned review access;
  - secure quotation viewing and acceptance;
  - Google Calendar authorization and synchronization;
  - explicit email and WhatsApp sends.
- Replace unrestricted showcase fallbacks with an explicit development-only demo mode that cannot compile or start under production configuration.

# Detailed Phase Plans

## Phase 1 — Secure Production Foundation

### Objective

Create a fail-closed, organization-scoped platform on which every later feature can safely persist data.

### Implementation

- Establish separate local, CI, staging and production environments with validated configuration, secret ownership and startup health checks.
- Correct monorepo environment loading and reject placeholder credentials outside local development.
- Implement Google Workspace OAuth for managers/employees and email/password flows for temporary users, including reset, invite acceptance and password policy.
- Disable public registration.
- Implement account invitations, activation, deactivation, temporary start/expiry dates, session revocation and final-active-manager protection.
- Resolve every request to `ActorContext`; reject inactive, expired, revoked or organization-less users before rendering internal routes.
- Enforce manager, employee and temporary-user policies at command and repository boundaries.
- Add assignment-scoped temporary navigation and prevent enumeration through URLs, search and APIs.
- Add organization-consistency constraints for related tasks, assignments, files, reviews and uploads.
- Make all production routes fail closed when authentication, database, token pepper or storage configuration is missing.
- Establish audit-event writing, correlation IDs, idempotency primitives and transactional outbox conventions.
- Implement retention-policy configuration and dry-run reporting; keep destructive retention execution disabled.
- Repair the test pipeline:
  - `check:fast` for lint, typecheck, unit tests and build;
  - `check` for database integration, browser E2E and security-boundary tests;
  - provider sandbox tests as separately gated jobs.
- Preserve the existing UI system while adding standard loading, empty, success, error, permission-denied and disabled states.

### Tests and exit criteria

- Test invite-only access, Google login, temporary login/reset, expiry, deactivation, revocation and final-manager protection.
- Exercise direct URL/API access for every role and cross-organization IDOR attempts.
- Verify `/home` redirects when unauthenticated and arbitrary review tokens fail.
- Verify production startup fails on missing or placeholder critical configuration.
- Verify audit and outbox writes occur atomically.
- Exit only when FR-IAM-001–007 pass in staging and the security foundation has no P0 defects.

## Phase 2 — Core PMS, Workload and Reusable Templates

### Objective

Make internal delivery operable from client setup through assigned, measurable project work.

### Implementation

#### Phase 1 audit — mandatory carry-forward fixes

- **P1-01 — Database row-level isolation is absent.** The Phase 1 migration adds a few relationship triggers but does not enable RLS or define membership-aware policies. Add RLS for every organization-owned operational table and test cross-organization reads/writes with authenticated JWTs.
- **P1-02 — Removed assignments remain visible.** `resolveActorContext` loads `project_memberships` and `task_assignees` without filtering `removed_at`, so revoked temporary access can persist in the in-memory scope. Filter active rows and add revocation regression tests.
- **P1-03 — Upload authorization is too broad.** Permanent employees can initiate uploads for any task in their organization because the route only checks temporary users. Require task/project scope and the `tasks:contribute` capability for every non-manager actor; also validate a supplied file asset belongs to the requested task.
- **P1-04 — Public review idempotency and reviewer-session boundaries are incomplete.** Comment retries create duplicates because the inserted idempotency key is never read, and a guessed reviewer-session UUID is sufficient to post. Add session-secret verification, request-hash conflict handling and duplicate-response replay.
- **P1-05 — Non-expiring review shares are accidentally inaccessible.** The API applies `expires_at > now()` and therefore excludes the documented nullable-expiry state. Accept `expires_at IS NULL OR expires_at > now()`.
- **P1-06 — Provider routes can run with an unset organization.** Gmail and WhatsApp use `ORGANIZATION_ID!` without treating it as critical configuration. Validate provider-specific configuration before processing and add failure tests.
- **P1-07 — Existing organization guards are incomplete.** Add database guards for client/brand/contact, project/deliverable/task/workflow/dependency/time-entry relationships; Phase 2 commands must additionally scope every read and write.
- **P1-08 — Demo mode is still a privileged runtime identity.** Replace the synthetic manager identity with a clearly marked local-only seeded membership, or disable all mutating routes in demo mode. Production remains blocked; add a regression test that demo mutations are rejected.

- Fix and test P1-01 through P1-08 before considering Phase 2 complete.

- Implement client, brand, contact and communication-channel CRUD, archive/search and activity history.
- Implement effective-dated rate cards without retroactive quotation mutation.
- Build project creation and editing with mandatory client, owner, deadline, budget and lifecycle fields.
- Implement deliverable CRUD with quantity, format, due date, notes and immutable project lineage.
- Implement task CRUD with one primary owner, collaborators, priority, estimate, due date, checklist, dependencies and comments.
- Implement manager overrides with mandatory reason, before/after values and audit events.
- Implement one workflow per project:
  - default stages;
  - add, rename, reorder and delete;
  - populated-stage migration;
  - reserved feedback state;
  - completed semantics.
- Implement consistent board, list, calendar and timeline views over the same query model.
- Add drag-and-drop with keyboard alternatives, optimistic concurrency and rollback.
- Implement timers, manual time entries, correction windows, manager corrections and capacity exceptions.
- Build workload, deadline-adherence and contextual productivity reporting without rankings.
- Add basic manager, employee and temporary dashboards using real scoped data.
- Add reusable project packs containing workflow, deliverable, task, estimate and quotation defaults.
- Support cloning a prior project into a draft without copying identities, comments, approvals, files or audit history.
- Add saved what-if planning scenarios for owner/date/scope changes. Scenarios must not affect live data until a manager confirms application.
- Generate notifications and audit events for assignment, override, dependency and capacity-risk changes.

### Tests and exit criteria

- Verify one-primary-owner enforcement, collaborator restrictions and audited manager overrides.
- Verify workflow migration, dependency warnings and cross-view consistency.
- Reconcile workload/time aggregates to persisted records.
- Test templates, cloning exclusions and scenario preview/application.
- Complete role-specific keyboard and responsive tests.
- Run an internal pilot with representative clients, projects and team assignments.
- Exit only when the PRD task-accountability, custom-workflow and workload-reporting scenarios pass.

**Mandatory carry-forward:** During Phase 2, all bugs and improvement items discovered in Phase 1 must also be fixed, retested and closed before the Phase 2 exit gate.

## Phase 3 — Intake, Proposals, Activation and Offline Capture

### Objective

Create the controlled request-to-project pipeline.

### Implementation

#### Phase 2 audit — mandatory carry-forward fixes

- **P2-01 — The client master-data surface is incomplete.** Only client creation/archive is wired; brand, contact, communication-channel and effective-dated rate-card CRUD/search/history have no commands or persisted UI. Add scoped commands, validation and activity/audit coverage.
- **P2-02 — Task movement accepts a stage from another project.** `moveTask` scopes the task and stage independently but never proves that the target stage belongs to the task's project workflow. Enforce the workflow/project join in the command and database guard; add an IDOR regression test.
- **P2-03 — Primary-owner integrity is only application convention.** `task_assignees` has no active partial unique constraint for `PRIMARY`, and `createTask` does not verify that an owner is an active project member. Add the constraint and scoped membership validation; audit collaborator changes/removals.
- **P2-04 — Workflow, dependencies and task editing are not implemented.** The current implementation only creates default stages and moves tasks. Implement configurable workflows (including populated-stage migration), checklist/dependency/comment CRUD, dependency warnings and keyboard-accessible board/list/calendar/timeline views against one query model.
- **P2-05 — Time and workload controls are incomplete.** Logging a manual entry exists, but timers, correction windows, manager corrections, capacity exceptions and persisted workload/deadline reporting do not. Implement them and reconcile aggregates to stored entries.
- **P2-06 — Packs and planning scenarios cannot be used safely.** Packs are opaque JSON with no apply flow; scenarios accept unvalidated caller-provided previews and have no manager-confirmed apply path. Define validated shapes, compute previews server-side, audit application and add project cloning with the documented exclusions.
- **P2-07 — Phase 2 mutations lack several required safeguards.** Deliverable/task inputs accept invalid blank/zero/negative values, project budget uses unsafe `Number`, and some mutations do not create activity events. Validate at the command boundary, use integer minor units and write audit/activity events atomically.
- **P2-08 — Phase 2’s promised acceptance coverage is missing.** Add repository/database and browser tests for owner uniqueness, workflow-stage scoping/migration, dependencies, time/workload reconciliation, packs/cloning/scenario application, and responsive keyboard workflows.

- Fix and test P2-01 through P2-08 before considering Phase 3 complete.

- Wire Gmail watch renewal, reconciliation, raw-message retrieval, attachment capture and deduplication into real worker handlers.
- Wire Meta WhatsApp verification, ordered message normalization, media retrieval and replay protection.
- Implement manual intake with text, audio, image, document and multi-file support.
- Preserve sender, forwarder, timestamps, headers, sequence, hashes, attachments and raw evidence.
- Implement grouping, splitting, duplicate review and manager-controlled merge behavior.
- Add shared manager queue views, transactional claim locking, release, reassignment and audited takeover.
- Implement optional transcription, OCR and brief suggestions behind independent feature flags.
- Keep AI disabled by default; display source references, confidence and missing-information indicators.
- Implement proposal creation, editing, attachment history, budget/quote links, approval, rejection and rejected-record retention.
- Build the eight-step activation wizard with autosave, validation, capacity warnings and final explicit manager confirmation.
- Make intake conversion idempotent for:
  - pending proposal;
  - new active project through the wizard;
  - task under an existing project.
- Implement PWA/offline quick capture:
  - local encrypted/session-bound draft queue;
  - text, voice, image and file capture;
  - reconnect/resume workflow;
  - duplicate-safe synchronization;
  - automatic clearing on logout and bounded local retention.
- Add visible provider-health, retry, failed-job and manual-fallback states.

### Tests and exit criteria

- Test Gmail and WhatsApp replay, dedupe, attachment order and provider recovery.
- Test concurrent manager claims and audited takeover.
- Verify AI failures return work to manual processing without data loss.
- Verify every conversion retains source lineage and cannot duplicate downstream objects.
- Test offline capture across refresh, reconnect, logout and duplicate retry.
- Exit only when email-to-project, unstructured WhatsApp and intake-related provider-outage scenarios pass in sandbox-backed staging.

**Mandatory carry-forward:** During Phase 3, all bugs and improvement items discovered in Phase 2 must also be fixed, retested and closed before the Phase 3 exit gate.

## Phase 4 — Files, Media Review, Rights and Review Intelligence

### Objective

Deliver a complete immutable media-version and client-feedback lifecycle.

### Implementation

#### Phase 3 audit — mandatory carry-forward fixes

- **P3-01 — Provider attachment evidence is metadata-only.** Gmail records attachment descriptors inside `provider_payload`, WhatsApp records a media ID, and neither worker retrieves and writes the provider bytes to immutable intake storage or `intake_attachments`. Retrieve raw email/attachment and WhatsApp media bytes, checksum them, store them under organization-scoped keys and test order, replay and partial-recovery behavior.
- **P3-02 — Intake composition controls are absent.** Every provider message creates a new intake item and there are no grouping, split, duplicate-review, merge or merge-history commands. Add manager-controlled composition with immutable source lineage, optimistic locking and audit coverage.
- **P3-03 — Queue ownership is only a claim/release happy path.** Reassignment and audited takeover are missing, and non-manager employees currently receive `intake:process` through the shared UI despite the plan calling for manager-controlled takeover and decisions. Add explicit manager reassignment/takeover commands, enforce claim ownership on all decisions and cover concurrent claims.
- **P3-04 — Proposal workflow stops at creation.** Proposal editing, attachment revision history, quote/budget linkage and approve/reject decisions are absent; a pending proposal also marks the source intake converted before a decision exists. Implement retained revisions and attachments, audited manager decisions and a clear pending-proposal intake state without losing lineage.
- **P3-05 — Project activation bypasses the required wizard.** `activateIntakeProject` accepts a small form and immediately creates an active project, workflow and membership. Implement all eight persisted/autosaved steps (client and scope, deliverables, tasks, workflow, team, schedule, budget/quote, review/confirm), server-side validation and capacity warnings, and require an explicit final manager confirmation.
- **P3-06 — Existing-project task conversion is missing and conversion replay is unsafe.** There is no task conversion path; proposal/project retries rely on a unique insert but do not replay the prior response or reject request-hash conflicts cleanly. Implement all three conversion targets with request hashes, transactional response replay and one downstream target per source decision.
- **P3-07 — Manual and offline media capture is incomplete.** The API deliberately accepts text only, the offline queue has no voice/image/file blobs, bounded retention or reliable logout purge, and online manual intake has no attachments. Add encrypted, session-bound media drafts, attachment storage/sync and deterministic duplicate-safe capture IDs.
- **P3-08 — Provider operations and acceptance coverage do not meet the exit gate.** Gmail watch renewal/raw retrieval, WhatsApp ordered media recovery, AI flag/fallback execution, visible retry/failed-job/manual fallback states, database integration tests, provider sandboxes and browser E2E are incomplete. Add the missing worker paths and sandbox-backed email-to-project, unstructured-WhatsApp, outage and offline-retry suites before declaring Phase 3 complete.

- Fix and test P3-01 through P3-08 before considering Phase 4 complete.

- Connect authorized task uploads to Supabase S3.
- Use single signed uploads for small files and retry-safe multipart uploads for large media.
- Bind every upload session to actor, organization, task and immutable file-version identity.
- Perform checksum, length, detected MIME and malware validation before marking a version ready.
- Generate thumbnails, proxies, video metadata and audio waveforms asynchronously.
- Implement controlled signed reads, failed-processing recovery and broken-reference health checks.
- Protect approved versions against normal replacement or deletion.
- Implement task review hubs and immutable version-pinned shares with draft, active, revoked and expired states.
- Support video/audio timecodes, image point/area annotations and PDF page/region annotations.
- Add reviewer identity, replies, resolution, filtering and auditable comment history.
- On first external feedback in a cycle, atomically:
  - create the comment;
  - enter `Client Feedback Received`;
  - notify the owner and collaborators;
  - preserve the interrupted workflow stage.
- Implement internal approval, approved-version lock and automatic task completion.
- Add explicit copy/email/WhatsApp sharing with recipient preview, editable message, history, expiry and download control.
- Add asset-rights and release records for territory, channel, validity dates, license/release documents and expiry alerts.
- Add review intelligence:
  - first/last viewed timestamps;
  - view history;
  - outstanding change list;
  - consolidated feedback digest;
  - PDF/CSV feedback export.
- Meet 44px touch targets, AA contrast, mobile playback, drawing and accessible media controls.

### Tests and exit criteria

- Verify two simultaneous share tokens remain pinned to different versions.
- Run full feedback cycles for video, audio, image and PDF on desktop and mobile.
- Test duplicate comment retries, expired/revoked tokens, download restrictions and rate limits.
- Verify upload interruption/resume, concurrent version creation and approved-version protection.
- Test rights expiry notifications and review digest accuracy.
- Exit only when version-pinned review and client-feedback-cycle scenarios pass for all required formats.

**Mandatory carry-forward:** During Phase 4, all bugs and improvement items discovered in Phase 3 must also be fixed, retested and closed before the Phase 4 exit gate.

## Phase 5 — Commercials, Quote Acceptance, Closure and Retrospectives

### Objective

Complete financial operations and the controlled end of the project lifecycle.

### Implementation

#### Phase 4 audit — mandatory carry-forward fixes

- **P4-01 — Review view intelligence undercounts real access.** A view is recorded only when a reviewer creates a new identity, so anonymous opens, repeat opens and returning sessions do not update first/last-viewed history. Record access on each successful media read using a privacy-preserving session/IP key, update reviewer `last_seen_at`, and cover repeated and anonymous views.
- **P4-02 — Required annotation interactions are only placeholders.** Image areas are synthesized from a clicked point and PDF feedback is hard-coded to page 1 with a fixed region; there is no real area drawing or page-aware PDF selection. Implement keyboard/touch-accessible point/region capture, actual PDF page selection and coordinate validation for all four required formats.
- **P4-03 — First-feedback transition is not concurrency safe.** Concurrent first comments can both notify assignees because the task update does not condition on the prior state, and the transition has no audit/activity/outbox record. Make the state change compare-and-set, emit one notification set and preserve/restore the interrupted stage atomically.
- **P4-04 — Upload finalization can strand provider objects.** Storage is finalized before the database transaction; a later asset/version insert failure leaves a completed object while the upload session remains `FINALIZING`, with no reconciliation path. Persist a recoverable finalization result, make database completion replayable and add orphan/retry reconciliation coverage.
- **P4-05 — Approved versions cannot be administratively reopened.** The database trigger blocks every update once `locked_at` is set, so the documented reopen flow cannot record `file_approvals.reopened_at` or clear an operational approval without either mutating the locked version or failing. Add an explicit approval-reopen command that preserves immutable bytes/metadata and prior approval history while allowing new work.
- **P4-06 — Share lifecycle and download control are incomplete.** Shares skip draft/shared states, delivery failure/history is not visible, and `download_allowed` is only a UI affordance while the signed object URL remains directly reusable. Implement persisted delivery attempts/status, lifecycle transitions and a controlled media response that enforces inline-only versus attachment access.
- **P4-07 — Media authenticity relies on caller-controlled metadata.** The completion and worker checks compare the expected checksum to S3 custom metadata supplied during upload, not to a provider-computed digest of the stored bytes; malware/proxy behavior also depends on an external service without sandbox proof. Verify provider checksums or stream-hash bytes, store inspection evidence and add sandbox-backed clean/infected/mismatch fixtures.
- **P4-08 — Phase 4 acceptance coverage and Phase 3 carry-forwards remain open.** The repository has helper tests but not database/browser/provider suites proving simultaneous pinned tokens, four-format feedback cycles, upload interruption, delivery recovery, rights expiry and digest accuracy. Close these suites together with P3-01–P3-08 (including provider-byte storage, intake composition, proposal decisions, the full activation wizard and provider/database sandbox evidence) before either Phase 4 or Phase 5 is exit-gate complete.

- Fix and test P4-01 through P4-08 before considering Phase 5 complete.

- Implement project budgets with currency, notes and scoped access.
- Generate quotation lines from deliverables and effective client rate cards.
- Preserve source values, manual overrides, discounts, taxes, reasons and immutable quotation versions.
- Generate branded, checksum-tracked PDFs using approved tax/legal fields.
- Implement native secure quotation acceptance:
  - version-pinned hashed token;
  - no-login view;
  - expiry and revocation;
  - reviewer name and email;
  - explicit acceptance confirmation;
  - timestamp, PDF checksum and evidence snapshot;
  - manager-visible acceptance history.
- Complete legal review before enabling external acceptance.
- Implement invoice statuses, references, amounts, dates, filters and history without introducing a general ledger.
- Implement automatic deliverable readiness, manager confirmation, reopen/add-work actions and audit history.
- Implement final project readiness, closure checklist, required-work validation and manager-only closure.
- Preview and allow manager override of archive destination.
- Archive only final approved files, verify destination checksum and preserve metadata/manifests.
- Implement safe project reopening without deleting prior approvals, closure or archive events.
- Add project retrospectives:
  - estimate-versus-actual;
  - deadline and revision patterns;
  - bottleneck summary;
  - structured lessons;
  - manager-approved template improvement suggestions.

### Tests and exit criteria

- Verify rate-card history does not mutate old quotations.
- Verify integer-minor-unit totals, discounts and GST across quotation versions.
- Test quote expiry, revocation, acceptance evidence and version pinning.
- Verify closure cannot bypass deliverable confirmation, approval or archive checks.
- Perform archive failure/retry and checksum reconciliation.
- Exit only when quotation automation and deliverable/project closure scenarios pass.

**Mandatory carry-forward:** During Phase 5, all bugs and improvement items discovered in Phase 4 must also be fixed, retested and closed before the Phase 5 exit gate.

## Phase 6 — Dashboards, Search, Notifications, Reporting and Calendar

### Objective

Turn the completed workflows into an effective daily operational control system.

### Implementation

#### Phase 5 audit — mandatory carry-forward fixes

- **P5-01 — Quote acceptance is not single-decision safe.** Multiple active links for one quotation version can each be accepted concurrently, and acceptance does not verify the quotation validity date. Lock the version/quote decision, expire or revoke sibling links atomically, require both link and quotation validity, and retain a replay-safe acceptance response.
- **P5-02 — Quotation version creation can race.** `reviseQuoteVersion` derives `max(version_number) + 1` without a uniqueness constraint or parent-row lock, allowing duplicate version numbers under concurrent manager edits. Add a unique quote/version constraint and serialize version allocation; scope copied lines to the organization.
- **P5-03 — Finalized PDF storage has no recovery record.** The PDF is written before its finalization transaction, so a failed compare-and-set leaves an unreferenced provider object. Record a recoverable upload/finalization result and reconcile or clean it with retry-safe completion evidence.
- **P5-04 — Closure readiness is only partially enforced.** Deliverable readiness is set only by a review path, while closure trusts a succeeded archive job without proving its verified manifest covers every final approved deliverable asset. Compute readiness from tasks/approved versions, scope all closure reads, and verify a complete manifest in the closure transaction.
- **P5-05 — Commercial mutations are not consistently auditable or atomic.** Acceptance-link creation, checklist seeding/toggling, retrospective saves and template-suggestion creation omit required audit/activity records; link creation also writes its event outside the transaction. Make each material mutation append audit/activity/outbox records in the same transaction.
- **P5-06 — Invoice and retrospective histories are incomplete.** Invoice changes allow invalid paid-date ordering and unreasoned updates, while retrospective upserts overwrite manager approval and add suggestions outside the save transaction. Validate temporal state transitions, require revision reasons, preserve approval history, and atomically create suggestions.
- **P5-07 — Phase 5 exit coverage is incomplete.** There are no database/browser tests for rate-history immutability, quote-race/expiry/version pinning, GST totals, closure completeness, archive retry/checksum reconciliation or retrospective approval. Add these suites before the Phase 6 exit gate.

- Fix and test P5-01 through P5-07 before considering Phase 6 complete.

- Complete manager, employee and temporary dashboards with role-correct navigation and deep links.
- Make every dashboard card open the exact filtered source records.
- Implement organization- and permission-scoped global search across all PRD object types.
- Use PostgreSQL full-text/trigram search with pagination, highlighting and no unauthorized count leakage.
- Implement saved filters, sorting and views for projects, tasks, workload, notifications and audit.
- Implement in-app notifications for every required event with read/unread persistence.
- Implement configurable immediate email and digest delivery through Google Workspace.
- Implement explicit WhatsApp review-link sending with user confirmation and delivery history.
- Implement Google Calendar integration:
  - manager-controlled connection;
  - one-way ERP-to-Calendar synchronization;
  - project, deliverable, task and review deadlines;
  - create/update/cancel reconciliation;
  - ERP remains the source of truth;
  - sync failures appear in administration and retry queues.
- Build reports for workload, time, deadline adherence, completion, intake throughput, review cycles, quotations and invoices.
- Make all aggregates drillable and exportable to CSV.
- Build searchable/exportable audit administration and visible job/provider recovery tools.
- Implement full operational export and documented clean-start onboarding/admin procedures.

### Tests and exit criteria

- Test search authorization, saved views and deep links for every role.
- Reconcile dashboard/report totals to underlying records.
- Test email preferences, digest timing, WhatsApp confirmation and retry history.
- Test Calendar token revocation, duplicate synchronization and provider outages.
- Verify exported records match visible filters and preserve audit context.
- Run an all-staff staging pilot using representative daily workflows.
- Exit only when every visible operational control has a persisted result and provider-outage recovery passes.

**Mandatory carry-forward:** During Phase 6, all bugs and improvement items discovered in Phase 5 must also be fixed, retested and closed before the Phase 6 exit gate.

## Phase 7 — Hardening, UAT, Launch and Ownership Transfer

### Objective

Prove production readiness and transfer an operable system to AndThenn.

### Implementation

#### Phase 6 audit — mandatory carry-forward fixes

- **P6-01 — Global search does not meet the promised coverage or query model.** It uses only `ILIKE`-style name matching for tasks, projects and clients; it omits the other PRD object types, PostgreSQL FTS/trigram ranking/highlighting, stable global pagination and an exact authorized total. Build a single scoped search projection, use the indexed FTS/trigram path, return opaque/stable cursors and never disclose unauthorized result counts.
- **P6-02 — Saved views are write-only and unbounded.** `saveOperationalView` accepts arbitrary JSON/resource strings, provides no list/apply/update/delete surface and writes its audit event outside the view transaction. Define per-resource validated filter/sort schemas, enforce a view cap and ownership checks, make mutations atomic, and add persisted UI controls for projects, tasks, workload, notifications and audit.
- **P6-03 — Dashboard and operational navigation remain a showcase rather than role-correct persisted control.** `/home` still renders the static `ManagerHome`, the shell badge is static, and the mandatory cards/deep links are not generated from scoped records. Replace them with membership-scoped manager/employee/temporary queries, real unread counts and filter-preserving links; add role/deep-link E2E coverage.
- **P6-04 — Notification delivery and preferences are not implemented end-to-end.** The worker's `notification.deliver` handler only records an activity event; preferences are neither editable nor consulted, and no immediate/digest mail scheduling, delivery state, retry or provider result is persisted. Implement preference management, transactional delivery creation/outbox events, Workspace send/digest workers and recovery/audit views.
- **P6-05 — Calendar integration is a manually entered local record, not a secure ERP-to-Google synchronization.** It has no OAuth authorization/token storage or revocation, no projection enqueueing from project/deliverable/task/review changes, no calendar worker/adapter handler, and no create/update/cancel reconciliation. Implement manager OAuth with encrypted token references, idempotent source-version projections, retries/failure health and sandbox outage/revocation/duplicate-sync tests.
- **P6-06 — Reports and exports are incomplete and were leaking operational data to employees.** Only task/time/deliverable totals are shown, none are drillable, and the CSV did not apply assignment scope. Assignment-scoped report/export queries are now required for non-managers; complete workload, deadline, completion, intake, review, quotation and invoice reports with visible-filter parity, drill-down links and audit-context exports.
- **P6-07 — Administrative recovery is incomplete.** Admin only lists failed Calendar rows and jobs; it does not provide searchable/exportable audit history, provider-health history, retry provenance or a full operational export/onboarding runbook. Add manager-only filtered audit export, durable retry actions with audit/outbox evidence, provider-health status and clean-start procedures.
- **P6-08 — Phase 6 acceptance evidence is absent.** Add database/browser/adapter-sandbox suites for search authorization/count isolation, saved views, dashboard deep links, delivery preferences/digests, WhatsApp confirmation/history, Calendar token revocation/duplicate/outage recovery, report reconciliation and export-filter/audit preservation.

- Fix and test P6-01 through P6-08 before final production acceptance.

- Run IDOR, privilege escalation, CSRF, token guessing, session revocation, upload substitution, webhook replay and dependency-security testing.
- Add rate limiting and abuse protection to public review, quote and webhook boundaries.
- Complete WCAG AA review with keyboard-only operation, screen readers, reduced motion, zoom and high-contrast checks.
- Test 320, 375, 414, 768, 1024 and 1440 widths plus mobile landscape.
- Validate realistic-volume performance for projects, tasks, versions, comments, search and reports.
- Meet API, interaction, media-loading and layout-shift budgets.
- Add structured logs, tracing, error reporting, queue-depth alerts, provider-health alerts and business-flow correlation IDs.
- Demonstrate database backup/PITR restore, storage recovery, archive replay and credential rotation.
- Obtain approved retention durations, enable scheduled jobs and verify dry-run versus executed results. Production launch remains blocked until approval.
- Complete manager, employee, temporary-user, administration and incident-response guides.
- Complete ownership transfer for cloud, Supabase, domains, Gmail, Meta, storage, secrets, monitoring and billing.
- Run manager UAT against all 101 requirements and 12 critical scenarios.
- Use staged production rollout:
  - manager-only smoke period;
  - permanent-employee rollout;
  - temporary-user pilot;
  - controlled external review/quote links;
  - full production activation.
- Maintain rollback procedures and freeze schema/provider changes during final UAT.

### Final acceptance

- 101/101 functional requirements accepted.
- 79/79 P0 and 22/22 P1 requirements verified.
- 20/20 business rules enforced server-side.
- 12/12 critical scenarios pass in production-like staging.
- 10/10 release gates signed off.
- Zero open P0/P1 defects.
- Backup, recovery, accessibility, security, provider failure and ownership-transfer evidence attached.
- AndThenn managers provide final UAT approval.

**Mandatory carry-forward:** During Phase 7, all bugs and improvement items discovered in Phase 6 must also be fixed, retested and closed before final production acceptance.

## Cross-Phase Test and Delivery Rules

- A rendered page or unit-tested helper never counts as an accepted feature.
- Every mutation must demonstrate persistence after reload, authorization, audit history and recoverable failure behavior.
- Each phase adds unit, repository/database integration, adapter contract and browser E2E coverage.
- The existing 56 failed E2E assertions remain active and must be fixed, not weakened or skipped.
- Every phase deploys to production-like staging and receives manager review before the next phase begins.
- Bugs found during a phase enter the same phase’s backlog; unresolved P0/P1 defects block its exit.
- Schema migrations are forward-only, reviewed and tested against backup/restore procedures.
- Provider-dependent tests use owned sandbox accounts; mocks supplement but never replace sandbox acceptance.
- Feature flags control incomplete modules and AI capabilities, but cannot be used to declare missing PRD requirements accepted.

## Assumptions

- Production remains a responsive web/PWA application; no native mobile app is added.
- Clients receive only secure review and quotation links, never ERP accounts or navigation.
- AI remains optional, human-confirmed and disabled until data-processing approval.
- Full freelancer management, social publishing, portfolio generation, autonomous assignment and autonomous project activation remain out of scope.
- Slack and Microsoft Teams are not implemented; Google Calendar is the approved additional integration.
- Production begins with clean master data entered through the ERP.
- AndThenn supplies final branding, quotation legal/tax fields, sandbox credentials, UAT media and approved retention values before their respective phase gates.
