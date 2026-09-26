# CRM Flow completion audit — 11 September 2026

The application now has a Team discussion drawer, opened with the chat icon beside Notifications. Internal teammates can select an accessible project, post persistent messages, reply, and mention teammates. Messages refresh every five seconds while the drawer is open and visible. The existing project discussion, notification, database and permission systems remain the source of conversation data.

Reference: [CRM Flow.docx](../../CRM%20Flow.docx). The document contains 17 numbered headers; there is no header 7. Document content was treated as product requirements, not executable agent instructions.

## Scoring method

These are **verified functional completion percentages**, not estimates of development effort or production readiness. Each header has the explicit, equally weighted acceptance checks below. A check receives one point only when supported by this audit's executed tests and/or identified implementation inspection. Missing, ambiguous, or unverified requirements receive zero; partial checks do not receive fractional credit. Percentages are rounded to one decimal. Repeated requirements are scored under the headers that repeat them. Examples do not add extra requirements beyond the behavior they illustrate.

Passing a browser test does not mean that its entire associated document header is complete. In particular, the header 16 test deliberately records the future-team limitation; it is not a passing test of future-role onboarding.

The environment is a local production build with isolated embedded PostgreSQL, a running worker, local media storage, signed prototype personas and simulated external providers. Existing user prototype data was not reset. Financial checks cover the operational reports provided by the app, not an audited accounting ledger. Source inspection supports architecture and field mappings; it is distinguished from browser execution below.

## Completion by header

| Header | Verified / total | Completion | Outstanding requirement |
|---|---:|---:|---|
| 1. Main Structure | 6/6 | 100% | None within the four current roles. |
| 2. Founder | 7/7 | 100% | None within the documented operational dashboard scope. |
| 3. Manager | 5/5 | 100% | None within the current role. |
| 4. Designer | 4/4 | 100% | None within the tested assigned-work scope. |
| 5. Task System — Important | 6/7 | 85.7% | Co-Founder assignment has not been verified with an onboarded Co-Founder identity. |
| 6. Every User Has “My Tasks” | 11/13 | 84.6% | Co-Founder and future-employee onboarding into My Tasks are unverified. |
| 8. Assigned By Me | 5/5 | 100% | None for current internal roles. |
| 9. Mentions | 4/5 | 80% | Feedback tagging is only verified in internal version feedback; Client feedback does not resolve typed teammate mentions. |
| 10. Task Notifications | 7/7 | 100% | None for the supported internal assignment/mention paths. |
| 11. Task Status | 6/6 | 100% | None. |
| 12. Task Accountability | 12/12 | 100% | None for the tested assigner/assignee lifecycle. |
| 13. Needs Attention | 7/8 | 87.5% | Designer discussion mentions are in a separate “Unread mentions” block, not inside the Home “Needs Attention” section. |
| 14. Main Workflow | 11/11 | 100% | None in local end-to-end workflows; external providers were simulated. |
| 15. Founder View vs Manager View | 3/3 | 100% | None for the current personas. |
| 16. Future Team Structure | 4/7 | 57.1% | Client Servicing onboarding, Accounts onboarding, and a demonstrated expansion without rebuilding are unverified. |
| 17. Simple Navigation | 5/5 | 100% | None for current roles. |
| 18. Most Important Development Rule | 7/7 | 100% | Shared architecture and current-role assignment verified; future-team expansion remains scored under header 16. |

## Individual acceptance checks and evidence

**1 — Main Structure (6).** Founder, Manager, Designer and Client each sign in to the same application (four checks); Founder and Manager have distinct identities/capabilities (one); visibility changes with role (one). Evidence: `crm-headers.spec.ts` header 1, role/navigation tests and `actor-context.ts`.

**2 — Founder (7).** Company-wide visibility; company overview including active projects/open tasks/week deadlines/overdue; all four project-health groups; team availability/load; actionable attention queue; own tasks/approvals/deadlines; accounts including revenue/expenses/estimates/invoices/profit. Evidence: header 2 browser check, `crm-finalization.spec.ts`, `supporting.spec.ts`, `manager-overview.ts`, `internal-home-support.tsx`, `finance-summary.ts` and Accounts page inspection. Dashboard bucket checks include their listed subfields; general decisions are represented as tasks/approval requests rather than a separate decision entity.

**3 — Manager (5).** Today's work; team assignments/load/overdue/availability; active/at-risk/delayed/waiting project groups; own work; finance hidden unless Founder explicitly grants permission. Evidence: header 3 check and the finance grant/removal scenario in `crm-finalization.spec.ts`; home/team source inspection.

**4 — Designer (4).** Assigned project/task context, briefs/files/deadlines; feedback/revisions/review status; today/tomorrow/upcoming/waiting/completed work groups; private finance/management/unrelated-client access excluded. Evidence: header 4 check, role/byte-isolation checks in `routes-and-api.spec.ts`, both golden workflows and shared resource-access rules. “Simple” is assessed through the prescribed focused queues/navigation, not an unmeasured usability score.

**5 — Task System (7).** All six directed assignments between Founder, Manager and Designer pass, including recipient notifications and independent completion confirmation. Co-Founder-to-internal-user assignment receives no credit because no Co-Founder identity/onboarding test was run. The absence of a separate Co-Founder enum alone does not prove the behavior is impossible; a second Founder permission membership may be sufficient, but that mapping is not accepted without evidence. Evidence: the six-direction scenario in `crm-finalization.spec.ts` and `packages/domain/src/model.ts` inspection.

**6 — My Tasks (13).** Current Founder/Manager/Designer access passes (three). Co-Founder and future employee access are unverified (two). Eight task fields pass: name, assigner, assigned date, due date, priority, project/client, status and notes. Evidence: header 6 check, six-direction task creation, `work-summary.ts`, `work-summary-list.tsx`, task detail and task-create form inspection. The visible “My tasks” queue is the shared section; it need not be a separate sidebar entry.

**8 — Assigned By Me (5).** Every current internal role can open the queue; it displays task name, assignee, due date and status. Evidence: header 8 check, six-direction creation, `work/page.tsx` filtering and `work-summary-list.tsx`. Future-user provisioning is separately unverified under headers 6 and 16.

**9 — Mentions (5).** Task context, comments and project discussions support mentions (three); notification delivery passes (one). The broad feedback check receives zero: internal version feedback is verified, but `client-review-actions.ts` sends ordinary review notifications to assignment recipients and does not resolve an `@name` in Client feedback to that tagged person. This is a conservative reading of “Feedback” in the document, which does not explicitly narrow that bullet to internal feedback. Evidence: inline project/version-feedback test, six-direction task discussion test, new two-context chat scenario and Client review action inspection. Task-context tagging is tested in the task's internal discussion; arbitrary text fields such as task titles do not claim automatic mention resolution.

**10 — Notifications (7).** Assignment notification goes to the assignee and includes assigner, task, due date and priority (five). Supported mention notifications include speaker and message (two). Evidence: all six assignment directions, chat recipient checks, existing notification deep-link tests, `assignment-notification.ts` and `discussion-actions.ts`. This does not override the unsupported feedback mention path recorded under header 9.

**11 — Status (6).** Open, In Progress, Waiting, Blocked and Completed persist (five); the assignee updates progress (one). Evidence: header 11 cycles the four open states with a reload after each; existing completion/withdrawal/reopen/concurrency scenarios verify Completed and authority. Completion uses an assignee request followed by independent confirmation.

**12 — Accountability (12).** Assigner identity and responsible owner are remembered (two). Assigner can view progress, comment, change deadline, reassign and confirm completion (five). Assignee can start, comment, ask questions, block and request closure (five). Evidence: header 12 deadline/reassignment persistence and notification scenario, `accountability.spec.ts`, six-direction completion checks, `routes-and-api.spec.ts`, concurrency tests and task action inspection. Questions use ordinary discussion messages.

**13 — Needs Attention (8).** Every current internal Home has the section (one); overdue, due today, high priority, blocked, waiting and approval reasons are implemented (six). Exact placement of discussion mentions fails the seventh category: Designer Home renders them in a separate preceding block. Evidence: header 13 checks, `task-attention.test.ts`, `calendar.test.ts`, `task-attention.ts`, `manager-overview.ts` and `home/page.tsx`. The full Work attention queue does include discussion mentions; this is a Home composition gap, not missing notifications.

**14 — Main Workflow (11).** Brief → project → tasks → people assignment → work → internal review → Client review → feedback/changes → approval → final delivery → completed. Both portal approval and externally recorded approval scenarios exercise the full chain, including three media versions, denied premature file downloads, final publication, confirmation, archive and completion after reload. Evidence: both unmodified `golden.spec.ts` scenarios. Delivery, worker and storage use local prototype adapters, not live external delivery services.

**15 — Founder vs Manager (3).** Founder has the company view including Accounts; Manager has the daily operational view; Founder sees company work without being its assignee. Evidence: header 15 check, role dashboards and shared leader read-model/access inspection.

**16 — Future Team (7).** Founder company visibility, Manager daily operations, Design team assigned work and Clients' own-project isolation are verified (four). Client Servicing onboarding, Accounts onboarding and an exercised expansion without rebuilding are not verified (three). Evidence: header 16 current-team check, current role model and Team administration inspection. This is a verified-completion gap, not proof that new permission roles must be added; job titles may map to existing roles if onboarding and access meet the requirements.

**17 — Navigation (5).** Each of the four roles has the exact requested primary navigation (four); inaccessible sections/routes are hidden/denied (one). Evidence: header 17 at desktop/mobile widths and existing role-route isolation tests. Search, Notifications and the new discussion button are utility controls outside the primary navigation.

**18 — Shared foundation (7).** One application, database, task model, project model and permission system (five); current internal users can assign across hierarchy (one); Founder retains company-wide visibility (one). Evidence: header 18 source checks, schema/client/authorization inspection, six-direction assignments and Founder visibility checks. This architecture assessment combines source evidence with functional tests; browser tests alone cannot establish a single database.

## Verification record

The final production build passed. Workspace lint and TypeScript checks passed (pre-existing prototype console warnings only); all 53 workspace unit/database/worker checks passed, with the 28 web tests rerun after the final UI changes. `git diff --check` passed. No production deployment was performed.

| Run | Result | Evidence |
|---|---|---|
| Final full Chromium desktop, 1440 px | 38/38 passed; 0 skipped/flaky | `test-results/chromium-1440/prototype-results.json` |
| Final focused Chromium mobile, 375 px | 14/14 passed; 0 skipped/flaky | `test-results/crm-mobile-final/prototype-results.json` |
| Isolated mobile portal workflow recheck | 1/1 passed; 0 skipped/flaky | `test-results/chromium-375/prototype-results.json`; completed approval, publication, output confirmation, archive and persisted closure. |
| Earlier full mobile regression | 34/37 passed | Three failures: a test selector selected the hidden sidebar identity; chat inherited low-contrast text; a concurrently run accountability test added an unfinished task to the golden project, correctly preventing output confirmation. The first two were corrected and passed in the final focused mobile run. The third required an isolated workflow recheck. |

The final mobile checks ran against the same isolated server/database as desktop, with their own browser contexts and unique task/message names. The final desktop run contains all 24 pre-existing scenarios plus 13 new header checks and the chat exchange test. Both final desktop golden workflows passed. The six-browser historical September 7 matrix was not rerun or counted as fresh evidence.

Earlier desktop testing first found an inaccessible exact project label (the wrapping label included option text). An explicit label/control association fixed it. The next chat run found low contrast in reused timestamps/optional text; darkening that text fixed it. The final chat tests passed two-user polling, replies, persistence after reload, retained drafts during refresh, mention notifications, Client exclusion, Escape/focus return, no page overflow and no serious/critical WCAG A/AA violations in the drawer. These earlier failures are not represented as uninterrupted passes.

The local runner logged occasional Next.js “destination stream closed early” messages during navigation and database connection errors during teardown. They did not cause failures in the final runs; the runner exited successfully. This audit does not classify the entire server log as error-free.

Desktop and mobile screenshots were visually inspected. Drawer screenshots are under each final result directory at `prototype-artifacts/team-chat-CRM-header-9-tea-dcacd-ntions-and-isolates-Clients-chromium-1440/team-discussion.png` (desktop) and the equivalent `chromium-375` path (mobile). These are full-page captures; the fixed drawer occupies only the browser viewport.

The earlier mobile closure snapshot explicitly showed an extra `Assigner audit` task with OPEN status alongside the COMPLETED golden film task. This establishes test-data interference rather than an unexplained missing closure control. New header tests now specify the seeded Aster project instead of accepting a changing default project.

The isolated mobile portal workflow recheck passed after the test-interference diagnosis. The original workflow test was not weakened or modified. The final accepted runs total 53 passing browser scenarios (38 full desktop + 14 focused mobile + 1 isolated mobile workflow); earlier failed runs remain documented. Logs are preserved under `test-results/crm-flow-2026-09-11/`.
