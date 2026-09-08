# CRM Flow browser acceptance audit

Tested 7 September 2026 against `CRM Flow.docx` using interactive Playwright browser tools and the repository's browser acceptance suite.

**Verdict: the application does not yet meet every requirement.** Most core workflows work on freshly seeded data, including all six Founder/Manager/Designer assignment directions, role-specific navigation, client isolation, discussion notifications, and delivery. Dashboard omissions, incomplete assignment notifications, incorrect approval counts, and a reproducible stale workflow form prevent full acceptance. The previously running instance also has incompatible role data.

## Environment and evidence

- Existing instance: http://localhost:58658. Founder selection produced **Mira Shah / MANAGER**, with no Accounts navigation; Manager selection returned to login. This was independently reproduced in the browser and acceptance tests. It is a persistent-data compatibility problem; it does not describe the fresh instance.
- Fresh instance: http://localhost:59094. Source copied from the current working tree to `/tmp/andthenn-prototype-audit-app`; dedicated seeded database at `/tmp/andthenn-prototype-crm-audit-20260907`. The original records were not reset or reseeded.
- Browser: Chromium. Interactive desktop and 375px mobile checks; the route test exercised 14 Manager routes at 375, 768, 1024 and 1440px (56 combinations), with no reported page overflow or uncaught browser errors.
- Current working tree contained pre-existing edits to `next-env.d.ts`, `migrations.test.ts`, `prototype.ts`, and an untracked `prototype-migrations.ts`; these were preserved. No application fixes were made.
- Local persona authentication and external services are simulated. This audit does not certify real identity-provider logins, production deployment, or actual external message delivery.

Evidence folders are relative to the repository root:

- [Fresh browser report](../../test-results/crm-audit-fresh-2026-09-07/prototype-report/index.html): **19 passed, 2 failed**, 21 tests, 2.1 minutes.
- [Focused recheck](../../test-results/crm-audit-recheck-2026-09-07/prototype-report/index.html): search passed; stale review-phase failure repeated.
- [Diagnostic workflow report](../../test-results/crm-audit-workaround-2026-09-07/prototype-report/index.html): an audit-only page reload after selecting a version allowed the external-approval path to proceed through delivery and task completion; archive creation needed a manual retry. Application source was unchanged. The diagnostic test itself did not pass.
- [Original-instance failures](../../test-results/crm-audit-2026-09-07/prototype-artifacts/accountability-CRM-R1-deta-b2891-ending-completion-authority-chromium-1440/error-context.md): stopped after incompatible persona data prevented meaningful testing.

The diagnostic workflow was then completed interactively: archive succeeded, Close project succeeded, and the completed state survived reload. [Completion evidence](../../test-results/crm-audit-fresh-2026-09-07/external-workflow-completed.png).

## Confirmed gaps

### F1 — Existing local data does not support the advertised roles

Priority: high. Document sections 1, 2, 3, 15 and 17.

At `localhost:58658/login`, select Founder. The resulting Home identifies Mira Shah as MANAGER, shows Today's Work, and omits Accounts. Clear the session and select Manager: the browser remains on login. Current seed definitions expect Mira as FOUNDER and Rohan as MANAGER, but restarting the existing persistent dataset did not bring it into that state. A fresh seed resolves these symptoms. Existing installations need an explicit data migration/compatibility path rather than depending on a reset.

### F2 — Founder dashboard lacks required company summaries

Priority: medium. Document sections 2 and 15.

Founder Home displays Active projects, Intake decisions, Setups to finish and Overdue tasks. It does **not** display a company-wide **Open Tasks** count or **Due This Week** summary. The open-task number under My Work is personal and cannot substitute for the company total. Founder and Manager share almost the same operational Home layout, with Founder adding Accounts.

Project health appears per project, and Team/Accounts are available, but the required top-level weekly company overview is incomplete. [Founder Home](../../test-results/crm-audit-fresh-2026-09-07/Founder-home.png).

### F3 — Completed work remains counted as an approval

Priority: medium. Document sections 2, 3, 12 and 13.

After the assignee requests completion and the assigner confirms it, Manager Home still counted completed tasks under “approvals assigned to me.” The observed count of 3 corresponded to three cards marked COMPLETED. Reload did not remove them. This makes My Work misrepresent outstanding action.

Reproduce: Manager creates a task for Designer → Designer requests completion → Manager confirms completion → Manager opens Home. `InternalHomeSupport` filters approval rows by request timestamp and reviewer, without excluding COMPLETED. [Screenshot](../../test-results/crm-audit-fresh-2026-09-07/completed-counted-as-approvals.png).

### F4 — New-task notification omits required context

Priority: medium. Document section 10.

A task assigned by Designer to Manager generated “New task assigned,” the task name, and notification timestamp. It omitted the **assigner's name, task due date and priority**, which the document explicitly includes. A separate assignment from Founder to Manager produced the same sparse layout. The detail page has these fields, but the notification itself does not. [Notifications](../../test-results/crm-audit-fresh-2026-09-07/notification-details.png).

### F5 — Typing an @mention is not sufficient to notify someone

Priority: medium if the document's inline @tag example is required literally; otherwise an interaction difference to accept explicitly. Document sections 9 and 10.

Designer posted `@Rohan CRM audit plain-text mention 20260907` inside a task. The comment persisted, but Manager received no mention notification. Checking Rohan in **Notify teammates** and posting a second comment did generate “Arjun Menon mentioned you,” the message body, and a working destination. Project discussions use the same explicit selection interaction.

Teammate notification is supported; inline text tagging shown in the document is not. Do not count the plain-text example as implemented merely because checkbox tagging works.

### F6 — Selecting a review version can leave the workflow form stale

Priority: medium. Document section 14.

Designer uploads V1 → selects it as Internal review candidate → immediately chooses Internal review → presses Move task. The app reports **“Task changed by another user; refresh and retry”**, even though this is the same user's sequential workflow. It reproduced in the original fresh-suite run and a focused rerun. A reload after version selection allowed progress.

[Failure details and snapshot](../../test-results/crm-audit-recheck-2026-09-07/prototype-artifacts/golden-golden-brief-versio-e2676-livery-and-verified-closure-chromium-1440/error-context.md). The defect is in the shared version/phase sequence, before the external-approval branch; it is not evidence that external approval recording itself fails.

### F7 — Some specified dashboard distinctions remain implicit

Priority: low to medium. Document sections 3 and 15.

Manager Home uses a combined attention queue and per-project pulse. It lacks dedicated Tasks Due Today and Client Feedback dashboard sections, and project health uses On Track / At Risk / Blocked / Waiting rather than the specified Active / At Risk / Delayed / Waiting for Client grouping. Due-today and feedback-related items can appear in combined queues. This is partial functional coverage, not an exact match to the requested information layout.

## Requirement coverage

“Pass” means exercised behavior or directly observed UI in the fresh instance. “Partial” identifies a mismatch or narrower coverage. “Not verified” is not a pass. Structural checks are clearly identified where a browser cannot prove the architectural property. The document skips section 7; no requirement was invented for it.

| Document requirement | Result | Evidence or limit |
|---|---|---|
| 1 — Four user types: Founder, Manager, Designer, Client | Pass fresh / fail existing | All four fresh personas entered distinct role scopes; F1 on existing data. |
| 1 — Founder and Manager are separate | Pass fresh / fail existing | Fresh identities Mira and Rohan; different finance visibility. |
| 1 — Founder may perform Manager work | Pass | Founder can open intake, work, clients, team, admin and finance. |
| 1 — One system with visibility by role | Pass in tested scopes | Same app and routes, different menus and accessible records. |
| 2 — Founder company-wide visibility | Pass in seeded company | Both client projects visible without personal ownership; foreign organization denied. |
| 2 — Company overview and active projects | Pass | Founder Home and project list. |
| 2 — Company Open Tasks | Fail | F2; personal count only. |
| 2 — Due This Week | Fail | F2; Team shows a weekly planning period, Home lacks company deadline summary. |
| 2 — Overdue | Pass | Home count and actionable task entries. |
| 2 — Health: On Track, At Risk, Blocked, Waiting | Pass with limit | Different states observed across existing/fresh data; not an exhaustive boundary test of the health calculation. |
| 2 — Team people, available, busy, overloaded | Partial | People, available/busy and load observed. UNKNOWN also shown for unestimated work. Overloaded threshold not deliberately driven in browser. |
| 2 — Needs Attention: approvals and important decisions | Partial | Intake decisions and completion requests exist; F3 makes personal approval count incorrect. “Important decisions” has no separate record type verified. |
| 2 — Needs Attention: risk, new briefs, blocked work | Pass | Seeded overdue/blocked tasks and intake surfaced. |
| 2 — My tasks and deadlines | Pass | Personal queue with task owners, dates and priority. |
| 2 — My approvals | Partial | Request/confirm works; F3 stale completed approvals. |
| 2 — Revenue, expenses, estimates, invoices, profit and accounts | Pass surfaces / limited calculations | Accounts shows all listed measures; expense creation/correction persisted. Paid revenue/invoice creation calculations were not independently exercised. |
| 3 — Project management and client servicing | Pass core flow | Intake setup, project, Client access, feedback and delivery exercised. |
| 3 — Today's Work: new briefs, projects needing attention | Pass | Intake and risk entries on Home. |
| 3 — Today's Work: tasks due today, Client feedback | Partial | Combined attention/review queues; no dedicated sections, F7. |
| 3 — Pending approvals | Partial | Completion workflow works; Home count fails, F3. |
| 3 — Team: working on what, workload, overdue, availability | Pass surfaces | Team rows and planning link; actual tasks available through project/work views. Overload calculations not exhaustively tested. |
| 3 — Projects: Active, At Risk, Delayed, Waiting for Client | Partial | Active list and health badges exist; exact grouping/labels differ, F7. |
| 3 — My tasks and deadlines | Pass | My Work and personal task list. |
| 3 — My approvals | Partial | F3. |
| 3 — Hide company finances without permission | Pass | Accounts absent; direct `/accounts` redirects Home. |
| 3 — Permit finances when explicitly granted | Not verified in browser | `financeAccess` flag and authorization branch exist; no grant control found in Team/Admin and no finance-enabled Manager persona supplied. |
| 4 — Assigned projects/tasks | Pass in tested assignments | Designer gains access to assigned work; task and project views available. |
| 4 — Briefs/files/deadlines | Pass | Task details and version upload tested. |
| 4 — Feedback/revisions/review status | Pass with reliability gap | Three-version review path exercised; F6 requires refresh in one sequence. |
| 4 — Due Today/Tomorrow/Upcoming/Waiting for Feedback/Completed | Pass surfaces | All five groups present; upcoming/review/completed populated. Empty Today/Tomorrow boundary correctness not independently proven. |
| 4 — Keep Designer simple | Mostly meets intent | Three primary navigation entries and focused Home; task detail remains comparatively dense. |
| 4 — Hide finances/profit/margins/private management | Pass in inspected surfaces | No finance on Designer Home/project; Accounts denied. Not an exhaustive security penetration test. |
| 4 — Hide other clients' information | Partial verification | Assigned project scoping and foreign-organization denial checked. Same-organization Designer cross-client isolation not exhaustively covered after assignments expanded access. |
| 5 — Designer → Founder | Pass | Existing browser handoff test, notifications, confirmation and reopen. |
| 5 — Designer → Manager | Pass | Interactive `CRM audit Designer to Manager 20260907`. |
| 5 — Manager → Designer | Pass | Accountability and golden workflow tests. |
| 5 — Manager → Founder | Pass | Interactive creation. |
| 5 — Founder → Designer | Pass | Interactive creation. |
| 5 — Founder → Manager | Pass | Interactive creation. |
| 5 — Co-Founder → anyone | Not independently verified | No Co-Founder persona. A second Founder might cover it, but that was not provisioned/tested. |
| 6 — My Tasks for Founder/Manager/Designer | Pass | Shared Work page has My tasks for each. |
| 6 — My Tasks for Co-Founder/future employees | Not independently verified | No added future-role account tested. |
| 6 — Task name, assigner, assigned date, due date | Pass | Visible on Work list and detail. |
| 6 — Priority, related project/client, status, notes | Pass | Visible and retained in created task. |
| 8 — Assigned By Me with assignee, due date, progress | Pass | Designer `/work?view=assigned` showed only its two assigned tasks after navigation settled. |
| 9 — Mentions in tasks/comments | Partial | Explicit Notify teammates selection works; literal @name alone does not, F5. |
| 9 — Mentions in project discussions | Pass selection flow | Project comment + checked teammate generated deep-linked notification and persisted. |
| 9 — Mentions in feedback | Partial verification | Version-specific feedback selector exists in internal discussion; separate feedback-tag submission not exercised. |
| 10 — New task notification | Partial | Delivered with task link, but required contextual fields missing, F4. |
| 10 — Tagged notification with author and message | Pass for selected tags | Author, body and destination observed; plain @text unsupported. |
| 11 — Open / In Progress / Waiting / Blocked / Completed | Pass core lifecycle | Options present; status updates persisted, completion request/confirmation exercised. |
| 11 — Assignee responsible for updating status | Pass | Primary assignee can update; closing request separate from confirmation. |
| 12 — Remember assigner and responsible person | Pass in tested edits | Provenance preserved after brief edit, deadline change and reassignment. |
| 12 — Assigner sees progress/comments | Pass | Assigned By Me and discussion. |
| 12 — Assigner changes deadline | Pass | Designer changed own assigned task due date; Manager saw persisted change. |
| 12 — Assigner reassigns | Pass | Designer changed owner from Rohan to Mira; original assigner remained Arjun. |
| 12 — Assigner confirms completion | Pass | Manager/Designer assigner confirmation flows exercised. |
| 12 — Assignee starts work/comments/questions/blocked | Pass | Status and discussion controls exercised. |
| 12 — Assignee sends closing request | Pass | Request, withdraw, re-request, confirm and reopen tested. |
| 13 — Needs Attention on every internal Home | Pass | Founder, Manager and Designer observed; temporary role access also tested. |
| 13 — Overdue/today/high priority/blocked/waiting | Partial verification | Overdue, high priority and blocked surfaced; Today/Waiting predicates exist but each populated Home scenario not separately driven. |
| 13 — Approval requests/mentions | Partial | Mention surfaced on Manager and Designer Home; F3 approval count issue. |
| 13 — Immediately understand who assigned work and when due | Partial | Work/Designer cards include provenance; Founder/Manager compact attention entries require opening task for full details. |
| 14 — Brief → project → tasks → assign → work | Pass | Manual intake and setup through task creation persisted. |
| 14 — Internal review → Client review → feedback/changes | Pass with defect | Portal run passed, repeated F6 stale form in second run. |
| 14 — Approval → final delivery | Pass | Portal and externally recorded approval exercised; premature Client file downloads denied. |
| 14 — Final delivery → completed | Pass with recovery caveat | Portal full closure passed. Diagnostic external path reached completed interactively after archive retry; automated diagnostic closure did not pass. |
| 15 — Founder company perspective vs Manager daily perspective | Partial | Finance differs, but Home summaries are mostly shared; F2/F7. |
| 15 — Founder need not own/manage work to see it | Pass in seeded company | Both company projects and task records visible. |
| 16 — Add separate Manager without rebuilding | Pass architecture / limited onboarding | Separate Manager works on fresh seed. Browser creation of a new member was not available/tested. |
| 16 — Future Client Servicing/Accounts/Design team | Not verified | No future-role onboarding or permission customization tested. Do not infer complete future-team support from the four current roles. |
| 16 — Client sees only own projects | Pass tested clients | Riya/Aster and Dev/Juniper isolation; direct URL, file and revoked access checks. |
| 17 — Founder Home/Work/Clients/Team/Files/Accounts | Pass fresh | All present; Settings/help are additional utilities. |
| 17 — Manager Home/Work/Clients/Team/Files | Pass | Accounts hidden. |
| 17 — Designer Home/My Work/Files | Pass | Also checked mobile navigation. |
| 17 — Client Home/My Projects/Files | Pass | No internal tasks/discussion in Client project. |
| 17 — Automatically hide inaccessible sections | Pass tested scopes | Navigation and direct-route denial verified. |
| 18 — One database/task/project/permission system | Supported by source inspection | Shared schema, membership roles, task/project entities and authorization code; browser observation alone cannot prove architecture. |
| 18 — Flexible assignment plus Founder visibility | Pass for tested current roles | Six directions and company-wide Founder view; future-role extension remains unverified. |

## Additional reliability observations

The first keyboard search test failed but passed on focused rerun. Interactive Enter also opened the search dialog. This is a timing/reliability observation, not a confirmed missing search feature.

In the diagnostic external-approval run, the test reached a fully verified checklist with `Archive: Not started` after attempting archive creation. Manually clicking Create verified archive, waiting, and refreshing produced SUCCEEDED, and Close project then persisted. The immediate cause of the first archive attempt was not established; do not treat the recovered path as an uninterrupted automated pass.

The automated suite includes stale edit protection, independent completion approval, foreign-organization isolation, invalid record URLs, unauthorized file bytes, validation, and Client access revocation. Those passing checks are useful evidence but are not a proof of every authorization edge case.

## Recommended acceptance order

1. Repair compatibility of existing persona/membership data so the app under review exposes the intended roles.
2. Exclude completed tasks from pending approval summaries and add assigner/due date/priority to assignment notifications.
3. Refresh dependent task forms after version selection so normal sequential actions do not conflict.
4. Add Founder Open Tasks / Due This Week and clarify Manager dashboard groups.
5. Implement inline @tagging or explicitly accept the checkbox interaction; verify version-feedback mentions, finance grants and future-member onboarding.
6. Rerun the untouched acceptance suite and targeted requirement scenarios. Keep recovered and diagnostic outcomes separate from clean passes.
