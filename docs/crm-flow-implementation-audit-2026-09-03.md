# CRM Flow Implementation Audit

**Audit date:** 3 September 2026\
**Implementation plan audited:** [CRM Flow Alignment Implementation Plan](./crm-flow-implementation-plan-2026-09-02.md)\
**Product source:** [CRM Flow.docx](../CRM%20Flow.docx)\
**Release recommendation:** **No-go for production**\
**Estimated plan completion:** **35% (±5%)**

## 1. Executive assessment

The repository has a stable prototype baseline, but the CRM Flow alignment is not production-ready. Build, typecheck, unit tests, and the current prototype browser suite pass. Those gates primarily prove the existing Manager, intake, upload-validation, and guest-review smoke paths; they do not prove the five-persona CRM contract or the complete brief-to-delivery journey.

Two findings independently block a production deployment:

1. `0012_crm_flow_alignment.sql` is absent from Drizzle's migration journal and will be skipped by the production migrator.
2. Client and Designer resource scoping is not consistently enforced below the navigation layer. Direct project routes and the Files page can expose organization-wide metadata.

The implementation also has conflicting task-completion paths, incomplete Founder behavior, no authenticated Client portal journey, and several backend-only feature fragments without usable UI. The current release should therefore be treated as a working prototype with partial CRM alignment, not a production candidate.

## 2. Scope and evidence

The audit compared the implementation plan with:

- database schema and migrations;
- domain authorization and transition rules;
- server actions and API routes;
- Founder, Manager, Designer, temporary-Designer, and intended Client surfaces;
- Home, Work, project, task, review, client, Team, Files, Accounts, search, and notifications;
- automated test coverage and release infrastructure;
- operational handover and mandatory manual gates.

Commands executed on the audited working tree:

| Gate | Result | Notes |
| --- | --- | --- |
| `pnpm check:fast` | Pass | Lint, typecheck, unit tests, and production build passed. |
| Unit tests | 34 passed | No database integration test layer for the new CRM behavior. |
| `pnpm acceptance:prototype` | 27/27 passed | Manager-centric legacy smoke coverage; not the CRM golden journey. |
| `git diff --check` | Pass | No whitespace errors in the audited changes. |

The working tree was not modified during the original audit. This document and the linked plan addendum are the only documentation changes made to record the result.

## 3. Completion assessment

The percentage is a work-item estimate against the five implementation phases, weighted by the number and importance of required outcomes. A partially present schema or server action is not counted as complete unless it is authorized, reachable through the intended UI, persisted, reconciled after reload, and covered by an appropriate test.

| Phase | Assessment | Completion |
| --- | --- | ---: |
| Phase 0 — Stabilize baseline | Core build and smoke gates pass, but autosave/Save-and-close, validation handling, not-found behavior, and complete responsive/error coverage remain incomplete. | 60% |
| Phase 1 — Roles, capabilities, shell | Role types, capabilities, and navigation exist. Resource-scoped reads, Founder parity, Client isolation, and production role migration do not. | 45% |
| Phase 2 — Accountable task spine | Execution status and completion fields exist. Universal task UI, assignment provenance, consistent completion, comments/mentions UI, review selection, and reconciliation are incomplete. | 35% |
| Phase 3 — Golden journey | Existing intake, files, and guest review provide a base, but the required continuous UI journey and Client portal are not implemented. | 15% |
| Phase 4 — Operational support | Basic client, Team, Files, Accounts, and unread-count surfaces exist; most required calculations, scoping, filters, and reconciliations do not. | 20% |
| **Weighted overall** | | **~35%** |

## 4. Priority defects and blockers

### P0 — Stop-ship

#### CRM-001 — Production migration omits the CRM schema

**Evidence**

- `packages/db/migrations/0012_crm_flow_alignment.sql` exists.
- `packages/db/migrations/meta/_journal.json` ends at `0011_intake_setup_wizard`.
- `packages/db/src/migrate.ts` invokes Drizzle's journal-driven migrator.
- The prototype bootstrap executes every `.sql` file directly, so prototype acceptance masks the production failure.
- Readiness verifies the outbox and PGMQ but not the expected CRM migration or columns.

**Impact**

A deployment may report healthy while the application fails at runtime when it reads `execution_status`, the new role values, completion columns, or new CRM tables.

**Required fix**

1. Generate or register `0012` through the supported Drizzle workflow and commit the updated journal metadata.
2. Test both a clean migration and an upgrade from the exact previous production schema.
3. Add a schema-version/readiness check for the latest required migration and critical columns.
4. Make deployment fail before traffic is shifted when migrations are missing.
5. Add a rollback/forward-fix rehearsal and verify that the backfill preserves workflow stages.

**Exit test**

- A database at migration `0011` upgrades using `pnpm db:migrate` only.
- The upgraded database passes schema assertions and the CRM golden browser journey.
- `/api/health/ready` returns 503 against an `0011` database and 200 after `0012` is applied.

#### CRM-002 — Client and Designer data isolation is incomplete

**Evidence**

- The shell permits Client access to `/projects` and `/files`.
- `/projects/[id]` scopes only by organization and returns every task for the project.
- `/files` returns every organization file version.
- the non-leader project list derives visibility from task assignments instead of using the Client's linked-client boundary plus explicit project membership.
- the application connects through its server database role, so UI navigation is not a security boundary.

**Impact**

An authenticated Client who obtains or guesses another project ID can view another client's project/task metadata. A Designer can receive file metadata outside assigned work.

**Required fix**

1. Introduce shared resource-scoped repository/read helpers for projects, tasks, files, reviews, clients, and search.
2. Require Client access to satisfy both `linkedClientIds` and an active explicit project grant.
3. Require Designer access through an active project grant or assigned/collaborating task as defined by the product contract.
4. Apply the same scope in page queries, server actions, API routes, exports, search, notifications, and file download/signing.
5. Add database-level organization-consistency constraints to all new CRM relations.
6. Add direct-URL and cross-client IDOR tests, not merely navigation-visibility tests.

**Exit test**

- Client A receives 404/403 for Client B's project, task, file, review, and search result.
- A Designer receives 404/403 for ungranted work even with a valid organization record ID.
- Founder retains company scope; Manager retains operational scope; no finance data leaks through shared queries.

#### CRM-003 — Founder is not functionally equivalent to the intended company owner

**Evidence**

- the Founder persona is seeded and receives Founder navigation;
- intake pages/actions, Administration, Commercial mutations, and parts of search still contain literal Manager-only checks;
- Founder links can therefore redirect, return not found, show partial data, or fail on submit.

**Impact**

The primary company persona cannot reliably accept a brief, set up a project, administer integrations, or manage Accounts.

**Required fix**

1. Replace literal role checks with capability checks and resource scopes.
2. Define separate capabilities for intake decisions, project activation, administration, finance view/manage, and operational overrides.
3. Audit every route, action, API, and query for `role === "MANAGER"` and migrate it intentionally.
4. Add Founder browser coverage for every primary navigation destination and mutation.

**Exit test**

- Founder can complete the full brief-to-delivery journey and manage Accounts.
- Manager can complete operational work but is denied finance unless explicitly granted.
- direct URLs and mutations enforce the same capability policy as navigation.

#### CRM-004 — Task completion has conflicting terminal paths

**Evidence**

- file approval directly sets `state_kind`, `execution_status`, `completed_at`, and confirmation provenance to completed;
- completion confirmation is separately implemented through request/confirm actions;
- the task UI only exposes confirmation to operational leaders, although the designated assigner may be a Designer;
- reassignment does not clear a pending completion request;
- request and confirmation writes lack optimistic concurrency predicates;
- database checks allow confirmation provenance without request provenance.

**Impact**

Media and non-media tasks follow different completion contracts. Concurrent or stale actions can confirm the wrong request, and task, deliverable, report, and project rollups may disagree.

**Required fix**

1. Establish one terminal command: completion may occur only from a valid pending request or an explicitly audited leadership override.
2. Make file approval advance review/delivery phase and lock the approved version without independently completing execution status.
3. Capture the designated reviewer at request time and allow that active assigner to confirm regardless of hierarchy.
4. Clear pending completion data transactionally on reassignment, reopen, or withdrawal.
5. Require expected task version/status in request, confirm, reassign, approval, and reopen commands.
6. Enforce request/confirmation shape and ordering in database constraints where practical.
7. Derive deliverable/project completion after the confirmed task transition in the same transaction or outbox-backed reconciliation.

**Exit test**

- text-only and media tasks complete through the same request/confirm rule;
- a Designer who assigned a task can confirm it;
- double submission, stale confirmation, reassignment, inactive reviewer fallback, and reopen are covered by integration tests;
- task, deliverable, project, Home, workload, and reports reconcile after reload.

### P1 — Major functional blockers

#### CRM-005 — Universal task assignment is not usable end to end

The domain action permits project-scoped assignment, but `/work?new=task` has no corresponding UI and project task creation remains leader-oriented. `Assigned by me` is hidden from Designers and temporary Designers. Task detail does not display real assignee, assigned-by, or assigned-at values.

**Required fix**

- implement quick create in Work, Project, and Task context;
- include every active internal membership and exclude Client memberships;
- expose My Tasks and Assigned by Me to every internal role;
- show assignee, collaborators, assigned by/date, due date, priority, project/client, status, and phase;
- notify newly assigned people with a validated deep link;
- decide and implement the standalone-task rule before finalizing the data model.

#### CRM-006 — Comments, mentions, and review selection are unreachable fragments

Durable mention and task-review-selection schema/actions exist, but no task UI invokes them. Internal comments are not read into the task page. A task can therefore be blocked from Client Review because the required selected version cannot be chosen through the application.

**Required fix**

- add the internal discussion feed and comment composer;
- add a membership-backed mention picker with deduplication and Client exclusion;
- create notifications only for valid, authorized mentions and verify destinations before rendering;
- add a visible internal-review version selector;
- make selection plus phase transition transactional or version-checked;
- add project-level activity where required by the plan.

#### CRM-007 — Authenticated Client portal is absent

There is no Client seed persona or browser test. Client Home falls through to the assigned-internal-work component, and project visibility is not based on the intended client/project grant combination.

**Required fix**

- seed at least two Client personas linked to different clients and projects;
- implement Client Home, My Projects, Files, review decisions, and recent final deliveries;
- reuse authorized project/file/review components without exposing internal comments, time, finance, or unrelated tasks;
- preserve guest review links as a separate, version-pinned boundary;
- add isolation and expired/revoked-access tests.

#### CRM-008 — Project setup still loses edits

Escape, backdrop click, and the button labelled Save and close navigate away without saving. There is no dirty-state Save/Discard/Stay guard, and raw minor-unit language remains visible.

**Required fix**

- debounce autosave with visible saved/saving/error state;
- make Save and close await the persisted save before navigation;
- prompt Save, Discard, or Stay for unsaved changes;
- preserve valid inputs when server validation fails and map issues to fields;
- format currency in major units and convert safely at the command boundary;
- test close, refresh, session resume, conflict, validation, and network retry.

### P2 — Supporting-area gaps

#### CRM-009 — Needs Attention is not the shared role-scoped read model

Manager Home includes a subset of blocked, overdue, review, intake, and setup signals. It omits waiting responses, due today, high priority, completion requests, mentions, and role-correct next-action ownership. Designer Home buckets all assigned tasks by date and does not consistently exclude completed work. Client Home is not implemented.

#### CRM-010 — Team is a roster, not an operational load view

Team lacks capacity, availability, active-load, overdue-count, and visible-window calculations. Removed assignments and completed tasks must be excluded and totals must reconcile to the same task source used by Work.

#### CRM-011 — Files is neither scoped nor filterable

Files lacks client/project/type/status filters, final-delivery treatment, and role scope. Signed reads and downloads must also be checked against current resource access at request time.

#### CRM-012 — Accounts does not meet the operational-finance contract

Accounts shows recorded expenses only. It does not reconcile budgets, quotes, invoices, revenue, expenses, estimates, or gross profit. There is no complete project-expense creation/editing flow. Existing Commercial mutations remain Manager-only and conflict with Founder ownership.

#### CRM-013 — Project and client workspaces are incomplete

The project detail route is a task list rather than the canonical Overview, Tasks, Review, Files, and Activity workspace. Client detail provides basic brands, contacts, and projects but not current next action, files, approvals, feedback, or activity.

#### CRM-014 — Search and notification deep links are incomplete

Search omits files and people, mis-scopes Founder, and does not implement Client-safe sources. Notifications display no record-opening action, so deep-link validity is not proven when access changes.

## 5. Manual blockers and required decisions

These items cannot be safely inferred in code.

| Blocker | Required owner | Decision/evidence required |
| --- | --- | --- |
| Standalone internal tasks | Product owner/client | Confirm whether project/client is optional. If optional, approve lightweight standalone-task scope and reporting behavior. |
| Production role migration | AndThenn leadership | Map every production membership to Founder, Manager, Designer, or Client; identify temporary accounts and expiry dates. |
| Production-data strategy | Product and engineering | Resolve the conflict between a clean production start and the CRM plan's explicit production-role mapping requirement. |
| Client access grants | Client/operations owner | Identify Client users, linked client records, permitted projects/files/reviews, invite owner, and revocation process. |
| Manager finance grants | Founder/finance owner | Name authorized Managers and approve default-deny behavior. |
| Accounts definitions | Finance owner | Approve currencies, expense categories, revenue recognition, tax/GST wording, and gross-profit formula. |
| Retention and privacy | Legal/security owner | Approve retention periods, review-link lifetime, archive/deletion behavior, and provider/data-processing obligations. |
| Production platform ownership | AndThenn operations | Supply organization-owned GCP/Supabase billing, domain/DNS, Gmail, Meta Business/WhatsApp, secrets, monitoring, and recovery contacts. |
| UAT and release sign-off | Founder, Manager, Designer, Client representatives | Sign off role Homes, navigation, mobile behavior, and the full golden journey. |

## 6. Required implementation roadmap

### Stage A — Repair the release boundary

**Objective:** make the application safe to deploy before expanding features.

1. Register and verify migration `0012`.
2. Add migration-upgrade and schema-readiness tests.
3. Implement scoped repositories/read helpers and apply them to every direct route and API.
4. Seed two isolated Client personas and add cross-client negative tests.
5. Replace stale Manager-only checks with capability checks.
6. Add database organization-consistency guards for all CRM tables.

**Gate A:** migrations, Founder parity, direct-URL authorization, Client isolation, build, lint, typecheck, and unit/integration tests all pass.

### Stage B — Complete the accountable task spine

**Objective:** make every internal role able to create, assign, perform, discuss, and complete work consistently.

1. Implement universal task create/assign UI and commands.
2. Expose My Tasks and Assigned by Me to all internal roles.
3. Display full assignment provenance.
4. Unify completion request/confirmation and remove automatic file-approval completion.
5. Add concurrency and reassignment handling.
6. Wire internal comments, mentions, notifications, and deep links.
7. Wire review-version selection and phase transitions.
8. Correct all rollups and reports to use confirmed execution status.

**Gate B:** Designer-to-Founder assignment, notification, comment, mention, block/wait, completion request, Designer assigner confirmation, media completion, text completion, reopen, and reload reconciliation pass through the UI.

### Stage C — Complete the golden brief-to-delivery journey

**Objective:** connect the existing foundations into one reload-safe workflow.

1. Finish Brief claim/release/decline/archive/attach decisions.
2. Implement autosave and safe close/resume.
3. Build the canonical project workspace and derived health/phase summaries.
4. Connect internal review selection, review changes, approval, Client share, and feedback events.
5. Implement authenticated Client review decisions and final-file access.
6. Implement final delivery, confirmed completion, deliverable closure, and project closure.
7. Ensure all events update Home, notifications, activity, and reports.

**Gate C:** the following journey passes from a clean database using only visible UI:

```text
Founder/Manager accepts brief → creates project and tasks → assigns Designer
→ Designer works and requests internal review → reviewer requests changes
→ Designer uploads a new version → internal approval → Client review
→ Client requests changes → Designer uploads a new version → Client approval
→ final delivery → assigner confirms completion → project completes
```

The same run must prove overdue, blocked, waiting, mention, Assigned by Me, finance denial, temporary expiry, and cross-client isolation.

### Stage D — Finish operational support

**Objective:** complete supporting areas without introducing separate systems.

1. Build shared Needs Attention and role-composed Home views.
2. Complete client/brand workspaces.
3. Build Team load over active assignments and a visible weekly window.
4. Build permission-scoped Files with filters and final-delivery treatment.
5. Reconcile Accounts across budgets, quotes, invoices, expenses, revenue, and gross profit.
6. Expand authorized search to clients, projects, tasks, files, and people.
7. Make notification rows open authorized records and handle lost access safely.

**Gate D:** navigation, calculations, filters, search, notification links, and finance denial match the persona contract at all supported widths.

### Stage E — Production hardening and release

**Objective:** prove the system in a production-like environment and complete manual ownership gates.

1. Run the full automated matrix below in CI against isolated databases.
2. Deploy to staging through the production image and migration process.
3. Complete provider sandbox tests for Gmail, WhatsApp, storage, and media inspection.
4. Complete backup restore, credential rotation, queue recovery, and alert-delivery drills.
5. Complete keyboard, screen-reader, reduced-motion, contrast, and mobile review checks.
6. Measure performance against agreed p95 budgets with representative data volume.
7. Obtain client sign-off, then use a monitored canary release with a documented rollback/forward-fix plan.

**Gate E:** every item in the release checklist is evidenced and signed off; no P0/P1 defects remain.

## 7. Required automated E2E matrix

### Persona coverage

| Scenario | Founder | Manager | Designer | Client | Temporary Designer |
| --- | ---: | ---: | ---: | ---: | ---: |
| Correct Home and navigation | Required | Required | Required | Required | Required |
| Direct-route authorization | Required | Required | Required | Required | Required |
| Create/assign internal task | Required | Required | Required | Denied | Scoped |
| My Tasks and Assigned by Me | Required | Required | Required | N/A | Required |
| Status, comment, mention | Required | Required | Required | Shared review only | Scoped |
| Request/confirm completion | Required | Required | Required | N/A | Scoped |
| Project/files/review scope | Company | Operational | Granted | Explicit client grant | Granted only |
| Accounts | Full | Grant only | Denied | Denied | Denied |
| Expiry/revocation | N/A | N/A | N/A | Required | Required |

### Browser and viewport coverage

- Chromium: 375, 768, 1024, and 1440 widths.
- WebKit: golden journey at 375 and 1440, plus Client review on supported media.
- No horizontal document overflow.
- Keyboard-only completion of navigation, setup, task actions, review, and Client decisions.
- Serious/critical Axe violations fail the suite.

### Integration coverage

- migration from `0011` to `0012`;
- cross-organization and cross-client relationship guards;
- assignment provenance and active-primary uniqueness;
- mention parsing/deduplication and notification deep links;
- completion request/confirm concurrency and reassignment;
- selected-review-version consistency;
- task/deliverable/project/report reconciliation;
- finance default denial and explicit grants;
- notification access after a grant is removed;
- deterministic clock, locale, and clean database per worker.

## 8. Production release checklist

The CRM Flow implementation is ready only when all items are complete:

- [ ] `0012` is journaled and upgrade-tested from the previous production schema.
- [ ] Readiness fails when the required schema version is absent.
- [ ] Founder, Manager, Designer, Client, and temporary Designer pass the policy/navigation matrix.
- [ ] Cross-client and cross-organization IDOR suites pass for pages, actions, APIs, exports, and files.
- [ ] Universal task creation and assignment work for every internal role within scope.
- [ ] Assignment provenance is visible and notifications deep-link correctly.
- [ ] Comments, mentions, review selection, and phase changes are reachable and durable.
- [ ] Media and text tasks use one completion request/confirmation contract.
- [ ] Reassignment, override, stale-write, reopen, and inactive-reviewer cases are tested.
- [ ] Save and close persists; unsaved exit offers Save, Discard, or Stay.
- [ ] The golden brief-to-delivery journey passes from a clean seed with no database intervention.
- [ ] Home, Work, Team, Files, Accounts, notifications, search, and reports reconcile after reload.
- [ ] Client A cannot access Client B's project, file, review, or task metadata.
- [ ] Manager/Designer/Client finance denial is proven; granted Manager behavior is proven.
- [ ] Supported responsive, accessibility, and browser matrices pass.
- [ ] Production-owned infrastructure, secrets, providers, monitoring, backup, and recovery are verified.
- [ ] Founder, Manager, Designer, and Client representatives sign off the role Homes and golden journey.
- [ ] No open P0 or P1 defects remain.

## 9. Final recommendation

Do not deploy the current CRM-alignment working tree to production. Complete Stage A before feature work continues, because the migration and authorization findings can invalidate otherwise correct UI work. After Stage A, implement the task spine and golden journey in vertical slices, with each slice including authorization, persistence, reconciliation, browser coverage, and operational evidence before it is considered complete.
