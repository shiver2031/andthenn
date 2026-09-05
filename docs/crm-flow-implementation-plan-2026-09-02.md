# CRM Flow Alignment Implementation Plan

**Status:** Ready for implementation planning\
**Date:** 2 September 2026\
**Product source of truth:** [CRM Flow.docx](../CRM%20Flow.docx)\
**Evidence:** repository audit, production-build checks, and desktop/mobile browser walkthroughs

This plan uses the current September build as its baseline. The August E2E and PRD gap documents remain useful history, but their static/inert feature counts no longer describe the current prototype and should not be used as the implementation scorecard for this work.

## 1. Executive decision

Do not rewrite the CRM. The repository already has useful foundations for clients, intake evidence, projects, task assignments, comments, files, versioned review, quotes, invoices, notifications, authorization, and audit history. Keep those foundations and reorganize the product around the client's operating model:

1. one application and one data model;
2. four explicit roles: Founder, Manager, Designer, and Client;
3. one universal internal task system;
4. one clear project lifecycle from brief to final delivery;
5. one role-scoped **Needs attention** queue as the primary home experience;
6. progressive disclosure for review, time, rights, and finance details.

The current visual foundation is generally polished. The main work is information architecture, permissions, state consistency, and workflow continuity—not a rebrand.

## 2. Verified current baseline

### Automated baseline

| Gate | Result | Interpretation |
| --- | --- | --- |
| Workspace build | Pass, 7/7 packages | The application builds in production mode. |
| TypeScript | Pass, 7/7 packages | The current type baseline is healthy. |
| Unit tests | Pass, 32 tests in 10 files | Useful foundation, but the exact CRM journey is not covered. |
| Lint | Fail | One unused function in `login-form.tsx`; three prototype console warnings. |
| Official prototype acceptance | 3/27 pass | Twenty-four failures share one test-harness origin bug: the runner uses `127.0.0.1`, while login redirects to `localhost`, so the session cookie is lost. |
| Diagnostic rerun with a temporary `localhost` override | 22/27 pass | The remaining five failures are Home color contrast plus two brittle intake assertions/shared-state cases. This is evidence about the app, not the checked-in command's current result. |

The current browser suite contains nine unique scenarios repeated across projects. It is a useful smoke suite, but it does not exercise the document's full brief-to-delivery flow.

### Manual browser findings

The audit covered manager, employee/designer, temporary collaborator, and anonymous reviewer experiences at 1440×900 and 375×812.

What already works well:

- seeded role entry, core route rendering, and basic role scoping;
- intake capture, intake approval, and the three-step project setup foundation;
- persisted task-stage changes and assignment notifications;
- version-pinned public review, reviewer identity, and feedback submission;
- a restrained visual language, clear focus styling, and generally good desktop layout;
- anonymous review is responsive on mobile.

Material gaps against the client flow:

| Area | Current status | Required outcome |
| --- | --- | --- |
| Roles | `MANAGER`, `EMPLOYEE`, and `TEMP_FREELANCER`; no Founder or Client role | Founder, Manager, Designer, Client; temporary access remains an account property. |
| Navigation | Manager-centric; no Team or Files; Commercial and Reports are prominent | Exact role-specific navigation from the document, with inaccessible areas absent. |
| Home | Large metrics dominate, especially on mobile | Action queue first; compact supporting summaries second. |
| Tasks | Creation is manager-only and project-gated; designer cannot assign Founder | Any active internal user can assign any active internal user within work they can access. |
| Task state | Project workflow stage doubles as status; a separate system state can contradict it | Exact execution statuses: Open, In Progress, Waiting, Blocked, Completed; review phase is separate. |
| Completion | Non-media tasks cannot reliably reach the terminal state; only file approval sets true completion | Assignee requests completion; assigner confirms it; all task types can complete. |
| Accountability | Assignment rows already retain assigner and assignment date, but the UI hides them | Show assigned by, assigned date, owner, due date, priority, project/client, and status. |
| Comments and mentions | Internal comments exist; durable `@mentions` do not | Mention picker, durable mention records, notifications, and deep links. |
| Brief setup | Useful base, but validation can surface raw Zod JSON; **Save and close** discards edits | Human validation, autosave/resume, explicit discard, and complete decision actions. |
| Projects | Mostly an accordion/table; dynamic detail is not the primary workspace | Canonical project workspace with Overview, Tasks, Review, Files, and Activity. |
| Client experience | Secure public review exists; Client role and portal do not | Lightweight client Home, My Projects, Files, and review actions. |
| Clients | List/create/archive only, despite rich client/brand/contact schema | Concise client workspace with contacts, brand guide, active projects, files, and activity. |
| Team | Workload anonymizes colleagues and includes misleading work | Named, scoped availability/load view using active assignments and a defined date window. |
| Accounts | One long page exposes every project form and technical terms | Founder aggregate Accounts; project-level finance detail; Manager hidden by default. |
| Responsive UX | Project task tables scroll horizontally; task detail overflows at 375 px; mobile nav is clipped | Mobile cards, contained forms, and a fully usable navigation drawer. |
| Feedback | Several invalid actions produce runtime overlays or silent failure | Inline errors, preserved input, retry, and designed empty/expired/not-found states. |

## 3. Product contract to implement

### Roles and access

| Role | Default scope | Home question | Finance |
| --- | --- | --- | --- |
| Founder | Entire company | “How is the company doing, what is happening, and what needs attention?” | Full access. |
| Manager | Operational work, clients, team, and files | “What needs to happen today?” | Hidden unless explicitly granted. |
| Designer | Assigned projects/tasks plus files needed for that work | “What do I need to work on?” | No access. |
| Client | Only explicitly shared client projects, files, reviews, and decisions | “What needs my review, and what has been delivered?” | No internal finance or margin data. |

Temporary access is not a separate job role. Model it through the existing `accountType`, expiry, and assignment scope. A temporary Designer should use the same Designer UI with stricter project/task visibility.

Use capabilities and resource scope for authorization; do not scatter checks such as `role === "MANAGER"` across routes. Adding a future role should mean adding a policy mapping and navigation configuration, not cloning pages or changing the task/project model.

Persist Client scope explicitly: add a small client-to-membership link and reuse explicit project membership grants for the projects that client may open. A Client membership must satisfy both the linked-client boundary and the project grant. Client memberships must never appear in internal assignee or internal `@mention` pickers.

### Universal task rules

- Every internal user may create a task in a project they can access and assign it to any active internal user, regardless of hierarchy.
- Keep one primary assignee and optional collaborators.
- Reuse `task_assignees.assigned_by_membership_id` and `assigned_at`; do not duplicate these fields on the task.
- Every internal user gets **My Tasks** and **Assigned by Me**.
- The assignee owns normal status changes and can comment, ask a question, mark blocked, or request completion.
- The assigner can follow progress, comment, change the deadline, reassign, and confirm completion.
- Founder/Manager override actions require a short reason and produce audit history.
- A new assignment and an `@mention` always create an in-app notification with a working destination.

### Separate execution status from workflow phase

The current `stateKind` and `currentWorkflowStageId` model conflates work progress with review lifecycle. Replace the user-facing contract with two independent concepts:

| Concept | Values | Owner |
| --- | --- | --- |
| Task execution status | Open, In Progress, Waiting, Blocked, Completed | Primarily the assignee. |
| Delivery/review phase | Work, Internal Review, Client Review, Changes, Approval, Final Delivery | The existing per-project workflow and each task's current workflow stage. |

“Client feedback received” is an attention event, not a terminal task status. “Brief” and “Project” are creation gates, not task statuses. “Completed” is terminal after the completion/approval rule is satisfied.

Do not add a second project or deliverable phase state machine. Reuse `workflows`, `workflow_stages`, and `tasks.current_workflow_stage_id` as the one canonical review/delivery phase model. A project or deliverable phase shown in the UI is a derived summary of its task stages and terminal records, not another stored status.

The default lifecycle is:

```text
Brief → Project → Tasks → Assign people → Work → Internal review
      → Client review → Feedback/changes → Approval → Final delivery → Completed
```

Project health should initially be derived, not manually maintained:

- **Blocked:** at least one open blocked task;
- **Waiting:** no blocker, but work is waiting on a response/review;
- **At risk:** overdue work or a near deadline with material incomplete work;
- **On track:** none of the above.

### Needs attention

Build one shared read model, filtered by capability and scope, for:

- overdue work;
- due today;
- high-priority work;
- blocked work;
- waiting responses;
- approval/completion requests;
- new briefs and client feedback for operational roles;
- unread mentions.

Each row should say what happened, why it needs attention, who owns the next action, when it is due, and offer one primary action. Limit Home previews to five items per section with **View all**.

## 4. Target information architecture

| Role | Primary navigation |
| --- | --- |
| Founder | Home, Work, Clients, Team, Files, Accounts |
| Manager | Home, Work, Clients, Team, Files |
| Designer | Home, My Work, Files |
| Client | Home, My Projects, Files |

Notifications and search remain header utilities. Profile, preferences, and administration move behind the profile menu rather than competing with daily work.

Use one set of underlying routes/components with scoped labels and data:

- `/home` — role-composed Home;
- `/work` — Briefs, Projects, Tasks, My Tasks, or Assigned by Me tabs as permitted;
- `/projects/[id]` — canonical project workspace;
- `/tasks/[id]` — canonical task detail;
- `/clients` and `/clients/[id]` — client list and workspace;
- `/team` — availability, load, overdue work, and member drill-down;
- `/files` — scoped file/version library;
- `/accounts` — Founder or explicitly authorized finance users only.

After each replacement reaches functional parity, keep compatibility redirects:

- `/intake` → `/work?view=briefs`;
- `/workload` → `/team`;
- `/commercial` → `/accounts`;
- `/proposals` → the relevant Briefs view.

Until then, keep each legacy route working and preserve its query parameters and deep links. Do not redirect users to an incomplete replacement.

Do not create separate Founder, Manager, Designer, or Client applications.

## 5. Screen-level UX direction

### Home

- Put **Needs attention** above summary metrics at every breakpoint.
- Founder: Needs attention, My Work, compact Company pulse, Team load, Accounts summary.
- Manager: Today's work, Team load, Project health, My Work.
- Designer: Due today, Due tomorrow, Upcoming, Waiting for feedback, Completed; keep completed collapsed.
- Client: Reviews/decisions needed, active projects, recent final files.
- On mobile, use compact summary chips or a two-column strip instead of four full-height KPI cards.

### Work and task detail

- **Work** is a filtered operational list, not several unrelated dashboards.
- The persistent task header contains title, status, assignee, assigned by, due date, priority, and project/client.
- Default body: brief, next action, discussion/activity.
- Secondary tabs: Files & review, Time, and Details. Show Rights only when the deliverable needs it.
- Keep one primary action visible. Put reassign, deadline change, and administrative overrides in a small **More** menu.
- On mobile, replace the project task table with cards ordered by urgency; never require horizontal page scrolling.

### Brief and project setup

- Rename the user concept from Intake to **Briefs** while preserving source evidence internally.
- Required decisions: claim/release, approve as new project, attach to existing project/task, decline, archive.
- Autosave each setup step. **Save and close** must persist; leaving with unsaved changes must offer Save, Discard, or Stay.
- Replace raw terms such as “minor units” with formatted currency and plain labels.
- Project setup should ask only for client, project name, owner, deadline, required outputs, initial tasks/owners, and optional budget. Advanced workflow configuration stays out of the initial path.

### Project workspace

- Header: client, project health, phase, owner, deadline, and next milestone.
- Tabs: Overview, Tasks, Review, Files, Activity.
- Finance appears as an additional Accounts tab only for Founder or a finance-granted Manager.
- Overview should summarize the brief, current next action, task progress, review state, and recent decisions—not repeat every editable form.

### Client and brand workspace

Use the existing clients, brands, contacts, channels, and projects data. Brand files are currently derived through project tasks; there is no direct brand-file relation. Add UI before adding more schema:

- client overview and primary contacts;
- a concise brand-guide card using existing brand notes and related-project files;
- active projects and current next action;
- recent approvals, feedback, and files;
- archive controls in an overflow menu.

Only introduce structured brand fields after real use proves that filtering or automated validation is needed. If teams need reusable brand source files outside a project, add one minimal brand/source-file association rather than a separate asset system.

### Team, Files, and Accounts

- **Team:** real names, availability, active load, overdue count, and a weekly window. Exclude removed assignments and completed tasks from active load.
- **Files:** one scoped library over existing file versions, filterable by client/project/type/status. Do not build a separate DAM.
- **Accounts:** split the current Commercial screen into a compact Founder overview and project-level details. Reuse budgets, quotes, and invoices; add a minimal project-expense ledger so revenue, expense, estimate, invoice, and gross-profit summaries are meaningful. Do not build a general ledger, tax engine, or payment reconciliation system.

### Interface guardrails

- Two primary sections at most above the fold.
- One primary action per card or panel.
- Five Home rows per section before **View all**.
- No raw enums, JSON validation messages, checksum terminology, or database units in user copy.
- Every mutation has visible pending, success, inline error, and retry states.
- Color never carries status alone; use a label/icon as well.
- Add designed loading, error, not-found, expired-link, and empty states.

## 6. Implementation sequence

### Phase 0 — Stabilize the baseline

**Purpose:** make current behavior trustworthy before restructuring it.

Work:

1. Use one configured origin everywhere in the prototype runner, login route, and Playwright config.
2. Make `acceptance:prototype` build required workspace packages from a clean checkout.
3. Fix lint, manager Home contrast, brittle intake locators, and cross-test database mutation.
4. Use one deterministic server/client date formatter to remove hydration mismatches.
5. Return a designed 404 for malformed or unknown task/project IDs instead of a server error. An invalid `/projects/[id]` or `?project=` value must never silently open the first project.
6. Convert Zod/server exceptions into field-level messages and preserve submitted data.
7. Make setup autosave and **Save and close** real before changing the wizard.
8. Fix mobile navigation clipping and task/review form overflow.
9. Add route-level `loading.tsx`, `error.tsx`, and `not-found.tsx` boundaries.

Primary touchpoints:

- `packages/db/src/prototype.ts`
- `apps/web/app/api/prototype/session/route.ts`
- `playwright.prototype.config.ts`
- `apps/web/components/login-form.tsx`
- `apps/web/components/project-setup-wizard.tsx`
- `apps/web/components/task-review-hub.tsx`
- `apps/web/app/(erp)/tasks/[id]/page.tsx`
- `apps/web/e2e/prototype/*`

Exit criteria:

- clean-clone build, lint, typecheck, unit tests, and current acceptance suite pass;
- no serious Axe finding on tested routes;
- no global horizontal overflow at 375 px;
- validation errors never produce a runtime overlay;
- setup edits survive close, reload, and resume.

### Phase 1 — Establish roles, capabilities, and the shared shell

**Purpose:** create the correct security and navigation contract before feature pages depend on it.

Work:

1. Add Founder, Designer, and Client to the membership role model; retain Manager.
2. Migrate temporary freelancers to their functional role plus `TEMPORARY` account type and expiry.
3. Replace manager/non-manager branches with a capability policy and resource-scoped read helpers.
4. Add explicit capabilities for company overview, team visibility, client portal, finance, and task assignment/confirmation.
5. Build one navigation configuration that emits only accessible destinations.
6. Introduce `/work`, `/team`, `/files`, and `/accounts` alongside the working legacy routes; switch to compatibility redirects only after each replacement reaches parity.
7. Establish the shared Needs-attention query shape and role-composed Home using only reliable existing signals. Add Blocked, Waiting, mentions, and completion requests in Phase 2 as their source events become real.

Primary touchpoints:

- `packages/db/src/schema.ts` and a forward migration
- `packages/domain/src/model.ts`
- `packages/domain/src/authorization.ts`
- `apps/web/app/(erp)/layout.tsx`
- `apps/web/components/app-shell.tsx`
- `apps/web/app/(erp)/home/page.tsx`

Migration rule: do not silently promote every existing Manager to Founder. Supply an explicit organization-level mapping for production data; update the prototype's current owner persona to Founder and map existing Employee personas to Designer.

Exit criteria:

- Founder sees company-wide work and Accounts;
- Manager sees operational work but no finance without a grant;
- Designer sees only scoped work and can access no company/finance data;
- Client sees only explicitly shared projects/files/reviews;
- temporary access expires without deleting work history;
- direct URLs and server actions enforce the same policy as navigation.

### Phase 2 — Build the accountable task spine

**Purpose:** make internal work assignment and completion match the document exactly.

Work:

1. Add `executionStatus` with Open, In Progress, Waiting, Blocked, and Completed.
2. Preserve workflow phase separately and centralize all transitions through domain commands.
3. Persist completion provenance on the task: requested by/at, the designated reviewer captured at request time, and confirmed by/at. Reassignment clears a pending request. If the designated reviewer is inactive or unavailable, Founder or Manager may confirm with a required reason. Use existing audit/progress events for history.
4. Add quick task creation from Work, Project, and Task context for every internal role.
5. Allow the assignee picker to include every active internal membership and explicitly exclude Client memberships. Apply the project-bound versus standalone task decision recorded in section 9 without fake projects.
6. Add My Tasks and Assigned by Me views and display existing assignment provenance.
7. Add task/project comments, a membership-backed internal mention picker, a durable comment-mention join, notifications, and object deep links.
8. Persist the selected internal-review file version in a single-row task review selection and require it transactionally before entering a review stage. Reuse that selection in the existing domain transition contract.
9. Rebuild task detail with progressive disclosure and role-correct actions.
10. Correct all rollups, workload, reports, and completion rules to use execution status.

Primary touchpoints:

- `packages/db/src/schema.ts` and migrations
- `packages/domain/src/transitions.ts`
- `packages/domain/src/authorization.ts`
- `apps/web/app/(erp)/actions.ts`
- `apps/web/app/(erp)/tasks/[id]/*`
- `apps/web/app/(erp)/notifications/*`

Backfill existing task state through a tested migration: true terminal records become Completed; all other records retain their workflow stage and receive a non-terminal execution status based on auditable existing state. Do not infer “Completed” merely from a stage named Completed.

Exit criteria:

- a Designer can assign a Founder a task in an accessible project;
- the recipient gets a deep-linked notification;
- assigned-by/date are visible;
- the assignee can start, wait, block, comment, mention, and request completion;
- the assigner can change due date, reassign, comment, and confirm completion;
- a text-only task and a media task can both complete correctly;
- no UI shows contradictory task status and phase.

### Phase 3 — Connect the golden brief-to-delivery journey

**Purpose:** turn the existing intake, project, files, and review foundations into one continuous client flow.

Work:

1. Complete Brief decision actions and autosaved project setup.
2. Make `/projects/[id]` the canonical workspace and keep list expansion only as a preview.
3. Implement the default workflow-stage transitions and enforce them through the existing domain layer. Derive project/deliverable phase summaries rather than storing another phase.
4. Connect internal review to selected file versions and client review shares.
5. Treat client feedback as an attention event and advance the project/deliverable to Changes without corrupting task status.
6. Support Request changes, Approve, Final delivery, and Complete as clear actions with audit history.
7. Add the lightweight Client portal using the same scoped project/file/review components; retain secure no-login review links for guest reviewers.
8. Make every assignment, mention, feedback, approval, blocked state, and completion request update Home and notifications immediately.

Exit criteria—the golden journey must work only through the UI and survive reloads:

```text
Founder/Manager accepts brief → creates project and tasks → assigns Designer
→ Designer works and requests internal review → reviewer requests a change
→ Designer submits a new version → internal approval → Client review
→ Client requests a change → new version → Client approval
→ final delivery → assigner confirms completion → project completes
```

The journey must also prove an overdue item, a blocked item, a mention, an Assigned-by-Me item, a denied finance route, and client isolation from another client's project.

### Phase 4 — Finish operational support without adding product sprawl

**Purpose:** complete the document's supporting areas after the central workflow is reliable.

Work:

1. Build the client workspace over the existing client/brand/contact schema.
2. Build Team using active task assignments, membership capacity, and capacity exceptions.
3. Build the scoped Files library over existing file versions and final deliverables.
4. Refactor Commercial into Founder Accounts plus authorized project Accounts tabs.
5. Add the minimal project-expense record and derived revenue/expense/estimate/invoice/gross-profit summaries.
6. Update search to return authorized clients, projects, tasks, files, and people; hide or disable search only when it truly has no scoped sources.
7. Replace the permanent notification dot with a real unread count/state.
8. Update manual guides and acceptance documentation so all sample IDs/tokens are generated or discovered, never stale constants.

Exit criteria:

- each role's navigation exactly matches the product contract;
- all Home cards and search/notification results open the exact authorized record;
- Team calculations have a visible time window and reconcile with active work;
- Accounts summaries reconcile with project records and are denied by default to Manager/Designer/Client;
- no supporting screen repeats all edit forms at once.

## 7. Test and release plan

### Required automated coverage

- **Domain tests:** full capability matrix; task status transitions; override reasons; completion request/confirmation; project health derivation; client isolation.
- **Integration tests:** any-internal-to-any-internal assignment; assignment provenance; mention parsing/deduplication; notification creation/deep-link resolution; rollup consistency; finance denial.
- **Browser tests:** one complete golden journey plus focused negative cases for Founder, Manager, Designer, Client, and temporary Designer.
- **Responsive matrix:** 375, 768, 1024, and 1440 widths; Chromium plus WebKit for the golden path.
- **Accessibility:** automated serious/critical Axe gate plus keyboard-only review of navigation, dialogs, task actions, setup, and client review.
- **Reliability:** clean database per worker or test-run namespace; no shared mutable seed counts; deterministic clock/locale.

### Persona acceptance matrix

| Scenario | Founder | Manager | Designer | Client | Temporary Designer |
| --- | ---: | ---: | ---: | ---: | ---: |
| See permitted Home queue | Company | Operations | Assigned | Shared client work | Assigned only |
| Create/assign internal task | Yes | Yes | Yes | No | Yes, within scope |
| Change owned task status | Yes | Yes | Yes | No | Yes, within scope |
| Confirm assigned-by-me completion | Yes | Yes | Yes | No | Yes, within scope |
| Review/comment | Yes | Yes | Yes | Shared review | Assigned review only |
| View Accounts | Yes | Grant only | No | No | No |
| View another client's/project's private work | Company-wide | Operational scope | No | No | No |

### Definition of done

The CRM Flow alignment is complete when:

1. the golden journey passes from a clean seed with no direct database intervention;
2. all five personas pass the policy and navigation matrix;
3. the existing build/lint/type/unit/browser gates pass from a clean checkout;
4. there are no serious/critical accessibility findings or horizontal page overflow at supported widths;
5. no expected validation, expired access, or malformed URL produces an unhandled server error;
6. status, phase, dashboards, workload, notifications, reports, and project completion reconcile after reload;
7. the client signs off on the role Homes and the full brief-to-delivery walkthrough.

## 8. Instagram reference evaluation

The supplied [Mask Off Instagram account](https://www.instagram.com/maskoffgin/) is a public Indian craft-gin brand account, not a CRM product interface. It should therefore be treated as a representative agency-client/content-operations reference, not as a software competitor. Anonymous inspection was also constrained by Instagram's login prompts.

Useful product implications:

- preserve a compact brand context—voice, key visual references, mandatory inclusions, locations/products, and source files—inside the client/project workspace;
- let one project spawn only the deliverables needed, such as post, carousel, Reel, or Story, rather than creating channel-specific modules;
- review creative, caption, collaborator/location/product context, mandatory checks, and version in one place;
- make mobile brief capture and file upload fast, since content work often begins away from a desk;
- record only lightweight post-publish facts: URL, date, channel, format, collaborator/location, and a small performance snapshot;
- optimize for operational measures—cycle time, revision count, overdue approvals, blocked work, and work in progress—rather than vanity metrics.

Efficiency advantage to target: create the brief once, reuse its client/brand context through tasks and review, and surface the single next action to each participant. This removes the repeated context gathering, status chasing, and screen switching that usually slows agency operations.

Explicitly defer:

- direct Instagram publishing or social listening;
- influencer discovery;
- a full digital-asset-management product;
- AI copy generation as a core workflow;
- complex social attribution/analytics;
- a dynamic role builder or separate app per role;
- a general accounting ledger;
- Availability/Community or other content themes as standalone modules—use tags/views if needed.

## 9. Assumptions carried into implementation

- The prototype's current owner/manager persona becomes Founder for demonstration data; production memberships use an explicit migration mapping.
- “Client” means a lightweight authenticated portal role, while secure guest review links remain supported.
- “Accounts” means operational project finance—estimates/quotes, invoices, revenue, expenses, and gross profit—not full accounting.
- Decide before Phase 2 whether “related project/client” is optional for an internal task. The recommended interpretation of “universal task system” is to allow a lightweight internal task without a project; if the client confirms every task is project work, retain the current constraint. Never create hidden or fake projects merely to hold operational tasks.

## 10. Post-implementation audit and required completion addendum

**Audit date:** 3 September 2026\
**Detailed audit:** [CRM Flow Implementation Audit](./crm-flow-implementation-audit-2026-09-03.md)\
**Production decision:** **No-go**\
**Estimated implementation completion:** **35% (±5%)**

The audit verified that the current build, typecheck, unit tests, and 27-case prototype suite pass. Those checks do not cover the CRM Flow definition of done: the five-persona policy matrix, authenticated Client isolation, universal assignment, consistent request/confirm completion, or the complete brief-to-delivery journey.

### Stop-ship fixes

Complete these before continuing feature rollout:

1. Register `0012_crm_flow_alignment.sql` in Drizzle's migration journal, test an upgrade from `0011`, and make readiness verify the required schema version.
2. Enforce resource scope below navigation for every project, task, file, review, client, search, export, and download query. A Client must satisfy both the linked-client boundary and an active explicit project grant.
3. Replace remaining literal Manager-only checks with the intended Founder/Manager capability policy and add Founder mutation coverage.
4. Remove direct task completion from file approval. Use one version-checked completion-request/confirmation command for media and non-media tasks, clear pending requests on reassignment, and reconcile task/deliverable/project rollups.

### Required functional completion

1. Implement quick task creation and assignment from Work, Project, and Task context for every internal role.
2. Expose My Tasks and Assigned by Me to every internal role and display assignee, assigned by/date, due date, priority, project/client, execution status, and review phase.
3. Wire internal comments, membership-backed mentions, mention notifications, object deep links, and internal-review version selection into task detail.
4. Make project setup autosave, make Save and close persist, and add Save/Discard/Stay protection for unsaved changes.
5. Build the authenticated Client Home, My Projects, Files, and review decisions while retaining guest review links as a separate boundary.
6. Finish the canonical project workspace with Overview, Tasks, Review, Files, and Activity; derive health and phase from canonical task/workflow data.
7. Complete Needs Attention, Team load, scoped Files, reconciled Accounts, authorized search, and notification deep links.

### Mandatory E2E completion gate

The implementation is not complete until this journey passes through visible UI from a clean database and survives reloads:

```text
Founder/Manager accepts brief → creates project and tasks → assigns Designer
→ Designer works and requests internal review → reviewer requests changes
→ Designer uploads a new version → internal approval → Client review
→ Client requests changes → Designer uploads a new version → Client approval
→ final delivery → assigner confirms completion → project completes
```

The same automated run must prove:

- an overdue task, blocked task, waiting task, mention, and Assigned-by-Me task;
- Designer-to-Founder assignment and Designer-assigner completion confirmation;
- a text-only task and a media task using the same terminal rule;
- finance denial for ungranted Manager, Designer, Client, and temporary Designer;
- temporary expiry and revoked project access;
- Client A isolation from Client B's project, task, file, review, search result, and direct URL;
- status, phase, Home, Team, Files, Accounts, notifications, reports, deliverables, and project completion reconciling after reload.

### Manual decisions and release gates

Before production, obtain and record:

1. the standalone-task decision;
2. the production membership/role and Manager-finance mapping;
3. Client membership and project/file/review grants;
4. operational-finance definitions and GST/legal approval;
5. retention/privacy decisions;
6. AndThenn-owned cloud, database, domain, provider, secret, monitoring, and recovery access;
7. keyboard/screen-reader, reduced-motion, mobile-media-review, provider-recovery, and backup-restore evidence;
8. Founder, Manager, Designer, and Client UAT sign-off.

No production release is permitted with an open P0 or P1 audit finding. The detailed audit is the execution tracker and contains the suggested fixes, test matrix, staged roadmap, and final release checklist.
