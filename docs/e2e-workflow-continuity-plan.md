# E2E Workflow Continuity Implementation Plan

**Status:** Draft for implementation  
**Planning baseline:** 40% workflow continuity  
**Target:** 95%+ verified continuity in production-like staging  
**Release relationship:** This plan accelerates the continuity portion of `PLAN.md`; it does not replace the 101-requirement, 12-scenario, or 10-gate production acceptance criteria.

## Executive outcome

Build one connected operating path from authenticated request intake through project delivery, client review, commercial acceptance, closure, reporting, and recovery. The path must be suitable for a polished demonstration because it is the real production path—not because a demo-only identity, hard-coded token, static record, direct database mutation, or alternate UI bypasses unfinished behavior.

The current 40% should be treated as **partial implementation continuity**, not acceptance. The repository contains several real commands, database records, upload/review paths, and commercial/closure actions, but the production-mode suite still proves none of the twelve PRD scenarios from entry to terminal outcome. Within that baseline, runtime/provider connectivity is only about 25–30%, and the asynchronous provider path is closer to 15%. Reaching 95% therefore requires both completing the handoffs and attaching repeatable evidence to them.

## 1. Continuity score and release rules

### Weighted scorecard

| Continuity area                                |  Weight | Planning baseline | Target | Principal gap                                                                                                  |
| ---------------------------------------------- | ------: | ----------------: | -----: | -------------------------------------------------------------------------------------------------------------- |
| Identity, route entry, and role scope          |      10 |                 4 |     10 | OAuth callback and public links are intercepted; temp-user lifecycle and assignment scope are incomplete       |
| Request intake through activation              |      20 |                 6 |     19 | Provider bytes, composition, decisions, the eight-step wizard, and task conversion are incomplete              |
| Project delivery and accountable work          |      15 |                 8 |     15 | Workflow editing, dependencies, collaborators, timers, and reconciled workload are incomplete                  |
| Files, pinned review, and approval             |      20 |                10 |     19 | Real storage/worker execution, byte integrity, four-format review, and safe recovery need proof                |
| Commercial acceptance and closure              |      15 |                 6 |     14 | Public quote access, revision/PDF recovery, verified archive, and full close/reopen continuity need proof      |
| Operational control and integrations           |      10 |                 4 |      9 | Home, deep links, notification delivery, Calendar, saved views, and recovery controls are incomplete           |
| Reliability, recovery, and acceptance evidence |      10 |                 2 |     10 | Fresh migration/deploy, CI, provider sandboxes, observability, accessibility, and recovery evidence are absent |
| **Total**                                      | **100** |            **40** | **96** |                                                                                                                |

Each area is scored against the same ten checkpoints:

1. A supported persona can enter through the correct authenticated or public route.
2. The visible action invokes a production command or signed public/provider boundary.
3. Server validation and authorization reject invalid, cross-tenant, expired, or out-of-scope requests.
4. The result is persisted and remains correct after reload and a new browser session.
5. The next workflow stage receives the right identifiers, source lineage, and version.
6. Dashboard, notification, search, and direct links reopen the exact scoped record.
7. Material mutations atomically record audit/activity and outbox evidence.
8. Duplicate, concurrent, interrupted, and provider-failure paths are idempotent and recoverable.
9. Manager, employee, temporary, and public-client boundaries are explicitly tested.
10. A production-build test produces traceable automated or approved manual evidence.

A checkpoint is `0` (absent/failing), `0.5` (partial or mock-only), or `1` (production-like proof). A mocked provider can prove an adapter contract, but it cannot earn the provider-sandbox checkpoint.

### 95%+ hard gate

The score is valid only when all of the following are also true:

- The weighted score is at least 95 and no area scores below 90% of its weight.
- All twelve PRD critical scenarios pass; none has a skipped critical assertion.
- Every mutation proves reload persistence, authorization, audit/outbox evidence, and a visible recovery path.
- Zero P0/P1 continuity or security defects remain open.
- Every P0 authentication, IDOR, public-token, revocation, integrity, and migration case passes; these cannot be averaged away by lower-risk checkpoints.
- The same commit passes fresh-database migration, upgrade migration, production startup, worker startup, and browser tests.
- Gmail, Meta, storage, queue, and authentication release checks use owned sandbox/staging credentials.
- Ten consecutive automated golden runs pass across at least two clean resets without quarantined or retried test assertions.
- Mandatory manual gates are signed; a `Blocked` manual item cannot be converted into a passing score.

## 2. Production-parity contract

The walkthrough and production must share:

- the same Next.js routes and server actions/API routes;
- the same Supabase Auth claims, active membership resolution, and assignment rules;
- the same domain commands, validation, PostgreSQL schema, RLS, audit events, and outbox;
- the same PGMQ queues, worker handlers, storage keys, checksums, and processing states;
- the same version-pinned review and quotation link policies;
- the same loading, failure, retry, expiry, revocation, and recovery states.

Only data and provider endpoints may differ between environments. Provider simulators are permitted at adapter boundaries for pull-request tests; real sandboxes remain a release gate.

The following are prohibited:

- a synthetic privileged “demo manager” or production `ALLOW_DEMO_MODE`;
- hard-coded database UUIDs, public tokens, or browser-local state presented as persistence;
- direct database changes to advance the on-stage workflow;
- a demo-only API, command, authorization exception, queue shortcut, or storage object;
- accepting a checkpoint snapshot or mocked provider run as production evidence.

Deterministic setup is allowed only in explicitly allow-listed local, CI, or staging projects. Startup and reset commands must fail closed for a production project ID or database host.

## 3. Connectivity assessment and target topology

```text
Gmail / WhatsApp / manual request
              |
              v
signed ingress -> PostgreSQL source evidence -> audit + transactional outbox
                                                   |
Browser -> route policy -> Auth -> ActorContext/DAL -> domain command
                                                   |
                                                   v
                                            PGMQ -> worker
                                                   |
                         S3 / media inspection / email / Calendar / archive
                                                   |
                                                   v
                               persisted terminal state + notification
                                                   |
                                                   v
                            scoped dashboard, deep link, report, and recovery UI

Public reviewer / quote recipient -> token policy -> pinned record -> controlled asset/action
```

| Connection                      | Current continuity break                                                                                                                   | Required target and release proof                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser → route policy          | `proxy.ts` treats OAuth callback and quotation routes as internal                                                                          | Explicit route classes; public callback/review/quote/health/provider boundaries bypass user-login redirects; internal routes fail closed                                                                  |
| Auth → actor context            | Google and temporary entry exist, but invite/reset/expiry/revocation are not complete end to end                                           | Real manager, employee, and temp fixtures; invitation, reset, expiry, deactivation, revocation, logout, and last-manager protection tests                                                                 |
| Actor → commands/read models    | Server checks exist unevenly and static surfaces remain                                                                                    | One authorization DAL for reads plus command-level authorization for every write; no route trusts UI visibility                                                                                           |
| Commands → PostgreSQL/RLS       | Fresh migrations can fail; broad membership RLS permits excessive direct access                                                            | Fresh and upgrade migration tests; table-by-table org, role, and assignment policies; JWT IDOR suite                                                                                                      |
| Web/worker → database pool      | Each database factory creates a new pool, and request call sites do not reliably close it                                                  | One bounded per-process pool through the Supabase transaction pooler; explicit shutdown; a 20-session connection-budget test                                                                              |
| Command → audit/outbox          | Coverage is not consistently atomic                                                                                                        | A transaction commits business row, audit/activity, idempotency response, and outbox together or commits none                                                                                             |
| Outbox → PGMQ → worker          | Queue map omits events such as Calendar sync; deployed worker/runtime is not healthy                                                       | Exhaustive event registry, unknown-event dead letter, leased retry/backoff, idempotent handler, HTTP health/readiness, deploy smoke                                                                       |
| Worker → Gmail                  | Reconciliation starts from the incoming cursor rather than the last persisted cursor; watch renewal and attachment-byte capture are absent | Transactional prior-cursor reconciliation/advance, watch renewal, expected Pub/Sub issuer/service-account validation, raw evidence, ordered attachments, checksums, replay and outage recovery in sandbox |
| Worker → WhatsApp               | Media IDs are persisted without retrieving immutable bytes; inbound account/phone scope is not fully verified                              | Signed and account-scoped webhook, ordered normalization, media retrieval, expiry recovery, replay protection, approved outbound templates, and manual fallback in sandbox                                |
| Web/worker → S3/media           | Upload finalization can strand; integrity trusts caller-supplied metadata; runtime config is incomplete                                    | Re-entrant upload state machine, server-computed byte hash, object ownership checks, inspection terminal states, interrupted multipart recovery                                                           |
| Public review → storage         | Review can expose reusable provider URLs even when download is disabled; image/PDF annotations are placeholders                            | Token-validating, range-capable media gateway; exact coordinate/page/time anchors; four-format desktop/mobile proof; mid-session revocation/expiry tests                                                  |
| Public quote → commercial       | Login redirect blocks the public route; finalization and revision races need recovery                                                      | No-login version-pinned link, same-origin redirect safety, single-decision acceptance, checksum-tracked PDF, conflict/retry tests                                                                         |
| Events → notifications/Calendar | Notification/retention handlers record markers; Calendar connect is not OAuth and emits an unhandled event                                 | Persisted delivery attempts/results/preferences, digest schedule, exact deep links, Calendar OAuth/token revocation/sync/retry                                                                            |
| Runtime → deployment            | Root environment loading, health behavior, Terraform, web secrets, worker image, and worker serving model are inconsistent                 | Validated environment manifest including mandatory HTTPS `APP_ORIGIN`; liveness/readiness split; buildable Terraform; complete secrets/resources; runnable monorepo image; staging deploy test            |
| System → operator               | No end-to-end correlation, queue/provider alert proof, or witnessed recovery                                                               | Correlation ID from ingress/UI through job/provider; status dashboards; alerts; backup/storage/archive replay and credential-rotation evidence                                                            |

## 4. Seven golden journeys

The seven journeys below cover the twelve PRD scenarios while preserving a single coherent product story.

### G0 — Identity, scope, and actionable home

Manager and employee sign in with Google Workspace; a manager-invited temporary collaborator signs in with email/password. Each lands on a persisted, role-correct home, follows an exact deep link, and loses access immediately on expiry, deactivation, assignment removal, or session revocation. Review and quotation recipients open valid links without an ERP account.

**Covers:** Temporary freelancer, IAM portions of ownership handover, and entry/authorization for every other journey.

### G1 — Request to controlled activation

A Gmail request with attachments and a multi-part WhatsApp request become immutable intake evidence. A manager selects, groups/splits where needed, claims, edits, and converts the request exactly once to a retained proposal, a project through the autosaved eight-step wizard, or a task under an existing project. Concurrent claims, duplicate webhooks, provider outage, and replay are visible and recover without duplicate downstream objects.

**Covers:** Email-to-project, unstructured WhatsApp request, provider outage.

### G2 — Project delivery and accountable work

The activated project has client/brand/contact/rate-card lineage, deliverables, one project workflow, a team, schedule, and budget. A manager configures stages and dependencies; an employee accepts assigned work, collaborates, moves the task, logs/corrects time, and updates checklist/comments. Workload, deadline, dashboard, and report aggregates reconcile after reload. A temporary collaborator sees only assigned project/task/file records.

**Covers:** Task accountability, custom workflow, workload reporting, temporary freelancer.

### G3 — Immutable upload to client approval

An authorized assignee uploads V1, the worker verifies actual bytes and inspection, and the manager creates a version-pinned share. The client reviews the correct video/audio/image/PDF asset on desktop or mobile, identifies themselves, leaves anchored feedback, and cannot escape download/expiry/revocation policy. Internal users follow the notification, resolve feedback, upload V2, prove V1’s old share remains pinned, approve V2, lock it, and advance the task/deliverable.

**Covers:** Version-pinned review, client feedback cycle.

### G4 — Rate card to accepted quotation and invoice status

The manager generates a quote from effective rates, records justified overrides, creates a new immutable revision, finalizes a checksum-tracked PDF, and sends a secure no-login link. The recipient accepts one exact version once; concurrent or repeated decisions replay safely. Acceptance is auditable and invoice status/history updates without changing prior quote facts.

**Covers:** Quotation automation.

### G5 — Delivery confirmation, verified archive, and close/reopen

Approved tasks roll into deliverable readiness. A manager records the required confirmation, satisfies the project checklist, runs checksum-verified archive jobs with visible retry, closes the project, records a retrospective, and reopens without corrupting prior approvals, versions, quotes, or audit history.

**Covers:** Deliverable/project closure.

### G6 — Operational control, failure recovery, and handover

Every dashboard card, search result, notification, saved view, report row, export, queue failure, provider-health item, and Calendar event opens the exact authorized object with filter context intact. An operator retries or chooses a documented manual fallback, sees the correlated terminal result, and can deploy, restore, rotate credentials, and recover storage/archive state from the runbooks.

**Covers:** Provider outage, ownership handover, operational continuity across all scenarios.

### Journey completion contract

A golden journey passes only when it runs from its real entry event to terminal business status, survives reload/new session, emits audit and downstream evidence, denies an inappropriate persona, handles at least one duplicate/interruption, and links back to the affected object. A test that merely renders a surface or observes a button click does not count.

## 5. Stage-ready walkthrough

Use one 15–18 minute story: **“Aster House — Monsoon Launch.”** The run resumes legitimate persisted work at appropriate stages, as a production team would; it does not manufacture state during the presentation.

| Time        | Persona and action                                                                                       | Continuity proof shown                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 0:00–1:30   | Mira, manager, signs in and opens a new WhatsApp/Gmail request from her home card                        | Real auth, role home, unread count, exact deep link                               |
| 1:30–4:00   | Inspect text, PDF/voice evidence, claim it, and resume an autosaved activation at Review & Confirm       | Provider lineage, claim ownership, wizard persistence, explicit activation        |
| 4:00–6:00   | Switch to Naina, employee; open assigned task, satisfy a dependency, move stage, and log time            | Role scope, task accountability, notification link, workload reconciliation       |
| 6:00–9:00   | Upload a small V1 media asset and create a client share after processing                                 | Authorized upload, real S3/queue/worker, checksum and visible states              |
| 9:00–11:30  | In a private window, the client leaves anchored feedback; Naina follows the notification and resolves it | No-login pinned review, public policy, feedback transition, notification delivery |
| 11:30–13:00 | Upload/approve V2 and show the old V1 share still opens V1                                               | Immutable versions, version pinning, approval lock                                |
| 13:00–15:30 | Mira finalizes the quotation; client accepts it in the private window; Mira updates invoice status       | Effective rates, immutable PDF/revision, no-login single acceptance, audit        |
| 15:30–18:00 | Confirm delivery, show verified archive/close, then open the report/audit trail                          | Closure gates, worker recovery state, operational deep links, end-to-end trace    |

Keep a two-minute appendix that deliberately replays a webhook or resumes an interrupted upload. Production buyers should see recovery, not just an immaculate happy path.

### Demo data and control plane

Implement these commands:

- `pnpm demo:reset -- --run-id <id>` — staging/local only; creates or resets one isolated demo organization.
- `pnpm demo:preflight -- --run-id <id>` — checks app readiness, auth personas, migrations, queue consumers, storage read/write, provider status, fixtures, and public-token policy.
- `pnpm demo:manifest -- --run-id <id>` — prints non-secret actor labels and exact checkpoint URLs for the operator.
- `pnpm e2e:golden -- --run-id <id>` — runs the same journeys in a production build and retains traces.

The reset must provide real linked Supabase Auth users, namespace-derived IDs, a configurable base clock, rate cards, four small licensed media fixtures, provider source evidence, and a unique storage prefix. It must compute checksums from bytes, drain only that run’s jobs/objects, poll terminal states without fixed sleeps, and refuse a non-allow-listed environment.

Chapter checkpoint records may exist as on-stage contingency links, but they must be created by the same domain commands and are never acceptance evidence. A real sandbox run of the complete journey must be recorded separately. Rehearse three consecutive clean runs from reset before a live demo.

## 6. Prioritized implementation backlog

### P0 — Foundation blockers; close before feature acceptance

1. **Repair database boot and isolation.** Make all migrations fresh-install and upgrade safe, including the duplicate `quote_version_number_unique` DDL in migrations `0000` and `0008`; replace the broad membership `FOR ALL` policies in `0004` with organization, role, assignment, and public-token policies; add JWT-based cross-org/direct-Supabase tests.
2. **Classify routes and complete identity entry.** Fix `apps/web/proxy.ts` so OAuth callback, review, quote, health, and signed webhook/provider boundaries do not enter the ERP-login redirect; complete invite, reset, expiry, deactivation, revocation, and logout; reject protocol-relative and cross-origin post-auth redirects.
3. **Make the production runtime reproducible.** Load/validate environment configuration from the monorepo root, require an HTTPS application origin, split liveness from dependency readiness, bound/reuse database pools, fix Terraform syntax/resources/secrets, and make both web and worker images contain all workspace packages and start successfully.
4. **Make async delivery closed and observable.** Register every event/queue/handler, dead-letter unknown events, persist `job_attempts` and poison jobs, implement leases/backoff/idempotency, expose worker readiness, and propagate correlation IDs through provider results.
5. **Fix storage and public-boundary integrity.** Make finalization re-entrant, hash server-observed bytes, enforce object ownership, serve media through an active-token policy gateway, honor download policy, apply independent global-IP/token/session rate limits, and bind every read/action to the pinned share/version.
6. **Replace the stale E2E harness.** Use a production build plus a deterministic fresh stack, real actor sessions, isolated organizations, worker polling, and database-visible assertions. The current static IDs/button-effect suite remains useful only as UI smoke coverage.

### P1 — Golden-path blockers; deliver as vertical slices

1. Retrieve and persist Gmail/WhatsApp bytes; add composition, claim takeover, decisions, all three conversion targets, and the eight-step activation wizard.
2. Complete client/brand/contact/rate-card, workflow migration, collaborators, checklist, dependencies, comments, timers/corrections, packs/cloning, and scenario apply.
3. Complete real four-format media processing, annotation anchors, feedback notifications/resolution, version pinning, approve/lock, and reopen.
4. Close quote revision races, PDF orphan recovery, public acceptance replay/conflict, invoice history, delivery confirmation, verified archive, closure, and retrospective.
5. Replace static home/shell counts with scoped read models; add exact notification/search/report links, saved views, real notification delivery, Calendar OAuth/sync/retry, and actionable job/provider recovery.

### P2 — Certification and walkthrough quality; required before production release

1. Complete offline media capture, encrypted/session-bound queue, bounded retention, logout purge, and duplicate-safe sync.
2. Add responsive and keyboard coverage for 320/375/414/768/1024/1440 widths, screen-reader verification, reduced motion, zoom, and high contrast.
3. Prove realistic-volume performance, rate limiting, abuse resistance, dependency/security scans, and public-link media budgets.
4. Finish operator guides, cue sheet, preflight diagnostics, status copy, empty/error/retry states, and support escalation links.
5. Witness backup/PITR restore, object recovery, archive replay, credential rotation, and ownership transfer.

## 7. Implementation roadmap

Indicative effort assumes two full-stack engineers plus shared platform/QA capacity. The score is a forecast ceiling, not credit earned before evidence passes.

| Milestone                     | Scope and exit evidence                                                                                                    | Forecast ceiling |    Indicative effort |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------: | -------------------: |
| M0 — Instrument the contract  | Freeze journey IDs/checkpoints, trace PRD tests, create defect register and run manifests                                  |               40 | 2–3 engineering days |
| M1 — Reproducible foundation  | Fresh/upgrade migrations, root env loading, production web/worker images, Terraform validation, health/readiness, CI stack |               50 |             5–8 days |
| M2 — Security and personas    | Route registry, OAuth callback/public routes, full account lifecycle, DAL/command guards, scoped RLS, persona fixtures     |               60 |             5–8 days |
| M3 — Request-to-work vertical | Provider bytes, intake controls, proposal decisions, activation/task conversion, core workflow/team/time/workload          |               74 |           10–15 days |
| M4 — Review vertical          | Re-entrant upload, byte integrity, inspection, four formats, pinned shares, feedback/notification, V2 approval             |               84 |            8–12 days |
| M5 — Commercial and close     | Rate-card quote, revisions/PDF, public acceptance, invoice, delivery/archive/close/reopen/retro                            |               90 |            6–10 days |
| M6 — Operational continuity   | Persisted dashboards, search/saved views, notification delivery, reports/exports, Calendar, recovery UI                    |               94 |             5–8 days |
| M7 — Certify 95%+             | Full matrix, sandbox runs, security/a11y/performance/recovery, UAT, runbooks, three demo rehearsals                        |              96+ |            5–10 days |

**Expected calendar:** roughly 6–8 weeks with the assumed team and prompt access to external accounts/decisions. Manual blockers or major schema rework extend the date; they must not be hidden inside engineering estimates.

M3 and M4 can overlap after M1–M2, but no journey earns acceptance against permissive RLS, a demo identity, an unreproducible database, or an undeployable worker. Build and review one vertical handoff at a time instead of declaring horizontal surfaces complete.

### First ten engineering days

1. Publish the route policy and event/handler registries; give every checkpoint a stable test ID and owner.
2. Fix fresh migrations and implement the first RLS matrix for organizations, projects, tasks, files, shares, and commercial records.
3. Create an ephemeral local/CI stack and load root environment configuration into the production web server and test runner.
4. Fix callback/public routing, safe return paths, linked auth personas, and expiry/revocation.
5. Make the worker image runnable with health/readiness and a complete event map.
6. Implement reset/preflight and replace hard-coded E2E records with isolated run data.
7. Prove a walking skeleton: manager login → create project/task → upload → public comment → internal notification, including reload/audit/retry.

This skeleton exposes integration defects early; subsequent milestones expand it backward into provider intake and forward into quote/closure.

## 8. Routing and authorization design

Maintain an explicit route-policy registry:

- **Authentication:** `/login`, `/auth/callback`, `/auth/invite`, `/auth/reset-password`.
- **Public token:** `/review/[token]`, `/quote/[token]` and only their narrowly scoped API routes.
- **Provider-signed:** Gmail/WhatsApp webhooks and Calendar callback, each authenticated by signature/state rather than an ERP browser session.
- **Operational:** `/api/health/live` and `/api/health/ready`; readiness details are restricted outside non-production environments.
- **Internal:** all ERP route-group pages and server actions.

`proxy.ts` should refresh/recognize the session and perform only an optimistic coarse redirect. It must not query full authorization state or intercept callbacks/public links. Preserve `pathname + search` through login only after parsing it against the configured application origin; reject `//`, schemes, backslashes, callback paths, and unauthorized destinations. The server-side data-access layer must load the active membership, role, account state, and live assignment scope close to each read. Every server action/API route must independently authorize the command, and RLS/constraints remain the final boundary.

If the browser uses Supabase only for Auth, revoke broad browser Data API grants on operational tables. Give the web, worker, and Auth-administration processes separate least-privilege roles; the normal web role must not own tables or bypass RLS. Generate public URLs only from mandatory `APP_ORIGIN`, never from an untrusted host header or a localhost fallback.

Use App Router route groups without changing public URLs, add `loading.tsx`, `error.tsx`, and relevant `not-found.tsx` boundaries to long-running journeys, and preserve filters/run context in `Link` destinations. Error boundaries must expose a safe retry/correlation reference rather than discard wizard/upload progress.

## 9. Test and evidence architecture

### Data isolation

- One organization and storage prefix per parallel Playwright worker/run.
- Namespace-derived IDs and relative dates; no assumptions about production IDs or wall-clock “today.”
- Real linked Supabase Auth personas; browser `storageState` generated by setup projects, never checked into source control.
- Business setup through the same commands/contracts; direct SQL only for infrastructure bootstrap that no product user can perform.
- Cleanup limited to the verified run namespace; terminal jobs are awaited with bounded polling and diagnostic output.

### Automated layers

| Layer                        | Runs                | Required evidence                                                                                  |
| ---------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| Domain/unit                  | Every PR            | Validation, state machines, authorization decisions, calculations, idempotency hashes              |
| Fresh/upgrade DB integration | Every PR            | Constraints, triggers, RLS/JWT matrix, audit/outbox atomicity, concurrent writes                   |
| Adapter contracts            | Every PR            | Gmail/Meta/storage/PGMQ/Calendar/notification success, replay, timeout, partial failure            |
| Core browser journeys        | Every PR            | Manager path plus critical public review/quote and unauthorized probes in a production build       |
| Full persona/device matrix   | Main/nightly        | Manager, employee, temp, public; key journeys at 375 and 1440; route smokes at all required widths |
| Provider sandboxes/media     | Nightly and release | Real Gmail/Meta/S3/Auth, four formats, retry/reconciliation, token expiry/revocation               |
| Release/manual               | Candidate build     | Screen reader, legal, recovery, rotation, UAT, ownership, and demo rehearsal evidence              |

Proposed commands:

```text
pnpm check:fast          # lint, typecheck, unit, build
pnpm check:db            # fresh + upgrade migration and RLS suite
pnpm check:integration   # worker, queues, storage and adapter contracts
pnpm e2e:core            # PR walking skeleton in production build
pnpm e2e:golden          # all seven journeys and personas
pnpm e2e:providers       # owned provider sandboxes
pnpm check:release       # all automated gates plus manual-evidence manifest validation
```

CI must retain Playwright trace/video/screenshots, correlated application/worker logs, migration logs, provider result IDs, audit/outbox/job identifiers, exported report samples, and a machine-readable continuity score. Fixed sleeps and arbitrary retries are prohibited; wait for named, persisted terminal states and fail with the current state/history.

## 10. Observability and operating targets

Instrument a correlation ID at browser/provider ingress and propagate it through audit, outbox, PGMQ, worker attempt, provider call, notification, and visible recovery status. At minimum, alert on readiness failure, migration mismatch, outbox age, queue depth/oldest age, repeated job failure, media quarantine, webhook rejection spikes, provider expiry, and archive verification failure.

Initial continuity budgets, to be validated with production-like load:

- accepted provider event visible in intake: p95 under 60 seconds;
- committed outbox event leased by a worker: p95 under 10 seconds;
- small demo media reaches a terminal inspection state: p95 under 120 seconds;
- public feedback visible internally and notification created: p95 under 60 seconds;
- duplicate ingress/action: zero duplicate downstream business objects;
- twenty concurrent walkthrough sessions: zero database connection exhaustion and within the agreed process/pooler budget;
- normal internal API p95: under 750 ms; visible interaction response: under 100 ms where no provider wait is required.

## 11. Manual blockers and decisions

These items cannot be closed by repository work alone. They should be assigned named AndThenn owners and due dates in M0.

| Manual blocker                                                                                                                                 | Needed by                   | Engineering can continue with              | Production/demo release gate                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| AndThenn-owned Supabase, GCP/Cloud Run, S3, DNS/domain, monitoring, billing, and secret-manager projects with least-privilege service accounts | M1                          | Local/CI equivalents                       | Staging deploy, recovery, rotation, and ownership evidence require owned accounts  |
| Google Workspace OAuth app, test users, Gmail watch/send sandbox, scopes, and admin consent                                                    | M2/M3                       | Contract simulator                         | Real sign-in, email intake/send, renewal and outage scenarios must pass            |
| Meta WhatsApp test business/number, webhook secret, templates, media permissions, and approved sender                                          | M3                          | Signed fixture adapter                     | Real message/media/order/replay/recovery scenario must pass                        |
| Licensed representative video, audio, image, and PDF files plus expected metadata/rights                                                       | M4                          | Generated fixtures                         | Four-format mobile/desktop UAT and live walkthrough require approved media         |
| Quotation legal wording, GST/tax fields, signer evidence policy, and legal acceptance setting                                                  | M5                          | Draft config with acceptance disabled      | Public quotation acceptance cannot be enabled without approval                     |
| Approved raw/media/archive/audit retention durations and deletion authority                                                                    | M7                          | Dry-run reports; destructive jobs disabled | Destructive schedules and production launch remain blocked                         |
| AI/transcription/OCR data-processing approval and provider terms                                                                               | Optional feature enablement | Manual processing with AI flags off        | Not a launch blocker if complete manual fallback is accepted; blocks AI enablement |
| Named manager, employee, temporary, and client UAT participants with test inboxes/devices                                                      | M7                          | Automated personas                         | Manager UAT and role/mobile evidence require real participants                     |
| Keyboard/screen-reader assessor and scheduled accessibility session                                                                            | M7                          | Automated axe/static checks                | WCAG manual gate remains blocked without witnessed testing                         |
| Witnesses and maintenance window for DB restore, storage recovery, archive replay, and credential rotation                                     | M7                          | Documented rehearsal in isolated env       | Recovery and ownership-handover scenarios require witnessed evidence               |
| On-call/support owners, escalation contacts, runbook acceptance, and cloud/account ownership sign-off                                          | M7                          | Draft documentation                        | Full production activation remains blocked                                         |

## 12. Definition of done

### Demo-ready

- `demo:reset` and `demo:preflight` complete safely, and the walkthrough succeeds three consecutive times from a production build.
- Every stage transition shows persisted state, a next action, and a correlation/audit reference; no presenter uses a database console.
- The private-window review and quote links work without login and remain correctly pinned/revocable.
- A documented checkpoint fallback exists, was generated through production commands, and is clearly identified as contingency rather than acceptance proof.
- The cue sheet lists persona, URL, expected state, timing budget, recovery step, and owner for each chapter.

### 95%+ continuity-ready

- The scorecard is at least 95, all seven journeys pass their completion contracts, and all twelve PRD scenarios pass in production-like staging.
- No critical assertion is skipped/flaky; zero open P0/P1 continuity/security defects.
- Fresh install, upgrade, web/worker deploy, provider retry, and backup/storage/archive recovery evidence attach to the same candidate commit.
- The manager, employee, temporary, public client, and operator paths pass their authorization and responsive gates.
- Alerts, dashboards, retry controls, runbooks, and manual fallbacks are usable by the named production operators.

### Production-ready

In addition to 95%+ workflow continuity, the parent plan still requires 101/101 requirements, 20/20 business rules, all 10 release gates, security/accessibility/performance evidence, zero P0/P1 defects, approved retention/legal settings, ownership transfer, and final AndThenn manager UAT. A neat walkthrough is evidence of coherence; it is not a substitute for those gates.
