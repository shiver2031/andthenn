# CRM flow fixes and verification

This change addresses findings F1–F7 in the [7 September browser audit](crm-flow-browser-audit-2026-09-07.md), using `CRM Flow.docx` as the functional reference. The application continues to use the shared task, project, database, and role-permission system.

## Changes

| Finding | Fix |
| --- | --- |
| F1 — Existing personas | A journaled, one-time prototype data repair adds missing known demo personas and upgrades the known Founder identity without resetting projects, tasks, assignments, comments, or user-created identities. It creates the separate Manager before upgrading the old Manager to Founder. Subsequent restarts preserve intentional role changes. |
| F2 — Founder summaries | Company-wide Open Tasks and Due This Week metrics, Monday–Sunday in the organization calendar, accompany Active Projects and Overdue Tasks. Project health groups and team availability counts are explicit. |
| F3 — Completed approvals | The shared work summary exposes no pending request for completed tasks. Personal approval counts and queues exclude completed work while retaining historical completion records. |
| F4 — Assignment notifications | Creation, setup assignment, and reassignment notifications include the assigning person's name, task name, deadline, timezone, and priority. Setup collaborators receive assignment notifications too. Reassignment withdrawals and completion notifications retain their distinct meaning. |
| F5 — Inline mentions | Task comments, project discussions, and version feedback recognize full-name mentions and unambiguous first-name mentions. Resolution uses only active internal teammates with access to the discussion. Explicit selections remain supported; repeated mentions are deduplicated and ambiguous first names require a full name or explicit selection. |
| F6 — Stale workflow forms | Task commands share a pending transition, and the phase selector follows committed phase changes. Sibling task forms remain disabled until the mutation and refreshed task version commit. Candidate-selection success is displayed after refresh. Server version comparisons still reject genuinely stale edits. |
| F7 — Manager distinctions | Dedicated Tasks Due Today, Client Feedback, and Pending Approvals sections; Active, At Risk, Delayed, and Waiting for Client project groups. Attention entries include assigner and deadline, and Team lists each person's assigned work. |

Founders can explicitly grant or remove a Manager's finance access from Team. The action rechecks Founder authority and the target organization, records an audit event, and invalidates navigation and page state. Managers cannot grant themselves this permission.

## Persistent instance repair

The existing instance at `http://localhost:58658` was repaired and checked in the browser. Founder now resolves to **Mira Shah / FOUNDER**, with Accounts and company summaries. Manager now resolves to **Rohan Bose / MANAGER**, with the daily dashboard and no Accounts navigation by default.

Before repair, the affected identity, client-membership, and capacity records were saved locally to `.prototype/backups/crm-personas-before-20260907.json`. Existing counts were unchanged: **1 project, 1 task, 0 internal comments**. No reset or seed replay was used. The migration is specific to known prototype identities; production role assignments are not inferred or rewritten.

## Verification

Lint, TypeScript checks, and all **53 unit/database/worker tests** passed. Production builds succeeded in the acceptance runner. Browser scenarios use isolated embedded PostgreSQL databases, local storage, a running worker, and simulated external providers. The original 21 acceptance scenarios remain unchanged. Three additional scenarios cover role dashboards and finance grants, all six internal assignment directions with notification/completion checks, and inline project/version-feedback mentions.

The existing golden scenarios exercise both portal and externally recorded Client approval through brief, setup, assignment, three file versions, internal review, Client revisions, final approval, publication, task completion, output confirmation, archive, and persisted project closure. No diagnostic refresh was added after review-version selection.

Regression coverage also includes competing edits and confirmations, independent completion review, Client isolation and access revocation, early-file download denial, forged task IDs, foreign-organization access, search, intake persistence, relationship edits, expense correction, and responsive route checks.

Run the complete browser matrix with `pnpm acceptance:prototype`. A single isolated browser run is available as `pnpm acceptance:prototype chromium-375` (also accepts the other configured Chromium and WebKit project names).

### Final browser results

The latest complete run of each configuration passed **144/144 checks**, with no skipped or flaky tests in those runs.

| Browser | Viewport width | Passed |
| --- | ---: | ---: |
| Chromium | 375 | 24/24 |
| Chromium | 768 | 24/24 |
| Chromium | 1024 | 24/24 |
| Chromium | 1440 | 24/24 |
| WebKit | 375 | 24/24 |
| WebKit | 1440 | 24/24 |

Local machine-readable results are in `test-results/prototype-results.json`, consolidated from the six per-browser reports. The initial matrix and recheck logs are preserved in `test-results/crm-flow-fixes-2026-09-07/`. Screenshots are retained in each browser's `prototype-artifacts` directory. Chromium 375 and WebKit 1440 totals use fresh full rechecks; see the history below.

## Run history

The first Chromium 375 run passed all 21 original scenarios and the new finance/dashboard scenario. Two new test selectors were corrected: the task-owner label contains its option text, and task discussion uses a labelled section rather than the project discussion wrapper. Those were test defects, not application workarounds.

One initial WebKit desktop run timed out while waiting for an uploaded V2 to leave QUEUED. A fresh full WebKit desktop run passed all 24 scenarios, including both golden workflows. Queue monitoring during that recheck recorded all six new media versions becoming READY and both archive jobs succeeding on their first attempts. The earlier timeout was not reproduced; it remains recorded here as an intermittent local-worker timing observation, not an uninterrupted first-run pass.
