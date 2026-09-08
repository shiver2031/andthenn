# CRM completion register — 5 September 2026

This register reconciles CRM Flow.docx, the original ERP PRD, and the September 4 audit. A test reference is a coverage location, **not proof that every acceptance clause of that requirement passed**. Historical audit counts remain historical. Production acceptance is pending until exact-release staging evidence and named approvals exist.

## Latest audit findings

| Finding | Implementation | Regression/evidence location | Acceptance state |
|---|---|---|---|
| CRM-R1 accountability | Assignment delta/history; independent reviewer; project-serialized completion/reassignment; reviewer designation | accountability.spec.ts, concurrency.spec.ts | Implemented; expanded acceptance in progress |
| CRM-R2 decision/delivery separation | 0013 classified approvals, legacy reconciliation queue, durable final_deliveries/current_final_files, publication and closure checks | golden.spec.ts (portal and external), migrations.test.ts, routes-and-api.spec.ts | Implemented; expanded acceptance in progress |
| CRM-R3 execution status | Shared Work summaries, separate phase, project/report status | golden.spec.ts, crm-surfaces.spec.ts, calendar.test.ts | Implemented; expanded acceptance in progress |
| CRM-R4 Client navigation | Granted canonical project links and revoked/unavailable states | crm-surfaces.spec.ts, routes-and-api.spec.ts | Implemented; expanded acceptance in progress |
| CRM-R5 persona Homes | Role compositions, calendar queues, shared health/load/finance | crm-surfaces.spec.ts, calendar.test.ts, team-load.test.ts | Implemented; expanded acceptance in progress |
| CRM-R6 discussion/search/notifications | Durable project/task/version discussions and scoped mentions, authorized polymorphic catalog, neutral revoked previews | crm-surfaces.spec.ts, routes-and-api.spec.ts | Implemented; expanded acceptance in progress |

## Accepted CRM interface contracts

| Contract | Implementation/evidence | Outstanding production evidence |
|---|---|---|
| Brief → save/resume setup → activation | intake actions, project-setup-wizard, core/golden/supporting tests | Live Gmail/WhatsApp reconciliation and failed-network UAT |
| Project/output-linked universal tasks | createTask, setup task model, accountability tests | Product-owner task-scope attestation |
| Internal clearance → Client decision → publication | delivery-command, client-review-actions, current_final_files, golden and migration tests | Named Client access and external evidence process |
| Primary request → independent confirmation → output → verified archive/closure | task-transaction, actions, archive worker, golden/concurrency | Real storage archive recovery, concurrent mutation staging |
| Role Homes, Work, Team, Clients, Files, Accounts | shared read models and supporting browser tests | Persona UAT, all currencies/provider formats/accessibility |
| Scoped discussions, search, notifications and bytes | discussion-actions, resource-catalog, file access policy | Live session revocation matrix |
| Production certification | protected production workflow, release gate and external evidence packet | All 14 approvals; provider/security/recovery/performance/staging gates |

## Retained PRD requirement register

| Requirement | Original title | Disposition | Coverage location | Acceptance |
|---|---|---|---|---|
| FR-IAM-001 | Invite-only authentication | Retained | resource-access.test.ts; routes-and-api.spec.ts | Requirement-specific sign-off pending |
| FR-IAM-002 | Temporary account expiry | Retained | resource-access.test.ts; routes-and-api.spec.ts | Requirement-specific sign-off pending |
| FR-IAM-003 | Role-based access control | Retained | resource-access.test.ts; routes-and-api.spec.ts | Requirement-specific sign-off pending |
| FR-IAM-004 | Project/task scoping | Retained | resource-access.test.ts; routes-and-api.spec.ts | Requirement-specific sign-off pending |
| FR-IAM-005 | Account deactivation | Retained | resource-access.test.ts; routes-and-api.spec.ts | Requirement-specific sign-off pending |
| FR-IAM-006 | Password and session controls | Retained | resource-access.test.ts; routes-and-api.spec.ts | Requirement-specific sign-off pending |
| FR-IAM-007 | Manager protection | Retained | resource-access.test.ts; routes-and-api.spec.ts | Requirement-specific sign-off pending |
| FR-CLT-001 | Client records | Retained | supporting.spec.ts | Requirement-specific sign-off pending |
| FR-CLT-002 | Multiple brands and contacts | Retained | supporting.spec.ts | Requirement-specific sign-off pending |
| FR-CLT-003 | Client rate card | Retained | supporting.spec.ts | Requirement-specific sign-off pending |
| FR-CLT-004 | Rate history | Retained | supporting.spec.ts | Requirement-specific sign-off pending |
| FR-CLT-005 | Client history | Retained | supporting.spec.ts | Requirement-specific sign-off pending |
| FR-INT-001 | Dedicated email intake | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-INT-002 | WhatsApp intake adapter | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-INT-003 | Manual fallback capture | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-INT-004 | Source preservation | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-INT-005 | Duplicate detection | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-INT-006 | Grouping and splitting | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-INT-007 | AI-assisted extraction | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-INT-008 | Shared manager queue | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-INT-009 | Claim locking | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-INT-010 | Conversion actions | Retained | golden.spec.ts; core.spec.ts | Requirement-specific sign-off pending |
| FR-PRP-001 | Single pending state | Retained | core.spec.ts; golden.spec.ts | Requirement-specific sign-off pending |
| FR-PRP-002 | Continuous editing | Retained | core.spec.ts; golden.spec.ts | Requirement-specific sign-off pending |
| FR-PRP-003 | Manager approval | Retained | core.spec.ts; golden.spec.ts | Requirement-specific sign-off pending |
| FR-PRP-004 | Approval handoff | Retained | core.spec.ts; golden.spec.ts | Requirement-specific sign-off pending |
| FR-PRP-005 | Rejected retention | Retained | core.spec.ts; golden.spec.ts | Requirement-specific sign-off pending |
| FR-PRJ-001 | Mandatory activation fields | Retained | golden.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-PRJ-002 | Suggestion prefill | Retained | golden.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-PRJ-003 | Project owner | Retained | golden.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-PRJ-004 | Project views | Retained | golden.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-PRJ-005 | Project health | Retained | golden.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-PRJ-006 | Project notes and activity | Retained | golden.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-PRJ-007 | Reopen project | Retained | golden.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-DLV-001 | Deliverable definition | Retained | golden.spec.ts | Requirement-specific sign-off pending |
| FR-DLV-002 | Single-project lineage | Retained | golden.spec.ts | Requirement-specific sign-off pending |
| FR-DLV-003 | Task roll-up | Retained | golden.spec.ts | Requirement-specific sign-off pending |
| FR-DLV-004 | Ready for confirmation | Retained | golden.spec.ts | Requirement-specific sign-off pending |
| FR-DLV-005 | Manager confirmation | Retained | golden.spec.ts | Requirement-specific sign-off pending |
| FR-TSK-001 | Trackable task fields | Retained | accountability.spec.ts; routes-and-api.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-TSK-002 | Single-deliverable lineage | Retained | accountability.spec.ts; routes-and-api.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-TSK-003 | Primary owner accountability | Retained | accountability.spec.ts; routes-and-api.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-TSK-004 | Collaborator contribution | Retained | accountability.spec.ts; routes-and-api.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-TSK-005 | Manager override | Retained | accountability.spec.ts; routes-and-api.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-TSK-006 | Priority | Retained | accountability.spec.ts; routes-and-api.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-TSK-007 | Checklist | Retained | accountability.spec.ts; routes-and-api.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-TSK-008 | Dependencies | Retained | accountability.spec.ts; routes-and-api.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-TSK-009 | Bulk operations | Retained | accountability.spec.ts; routes-and-api.spec.ts; concurrency.spec.ts | Requirement-specific sign-off pending |
| FR-WFL-001 | Default workflow | Retained | golden.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-WFL-002 | One workflow per project | Retained | golden.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-WFL-003 | Manager customisation | Retained | golden.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-WFL-004 | Stage deletion safeguard | Retained | golden.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-WFL-005 | Reserved feedback state | Retained | golden.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-WFL-006 | Client Review action | Retained | golden.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-WFL-007 | Completed semantics | Amended by CR-002 | golden.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-TME-001 | Time capture | Retained | team-load.test.ts; calendar.test.ts | Requirement-specific sign-off pending |
| FR-TME-002 | Capacity settings | Retained | team-load.test.ts; calendar.test.ts | Requirement-specific sign-off pending |
| FR-TME-003 | Estimated effort | Retained | team-load.test.ts; calendar.test.ts | Requirement-specific sign-off pending |
| FR-TME-004 | Workload view | Retained | team-load.test.ts; calendar.test.ts | Requirement-specific sign-off pending |
| FR-TME-005 | Deadline adherence | Retained | team-load.test.ts; calendar.test.ts | Requirement-specific sign-off pending |
| FR-TME-006 | Task completion | Retained | team-load.test.ts; calendar.test.ts | Requirement-specific sign-off pending |
| FR-TME-007 | Productivity indicators | Retained | team-load.test.ts; calendar.test.ts | Requirement-specific sign-off pending |
| FR-TME-008 | Timesheet corrections | Retained | team-load.test.ts; calendar.test.ts | Requirement-specific sign-off pending |
| FR-FIL-001 | Version ledger | Retained | migrations.test.ts; routes-and-api.spec.ts; media.test.ts | Requirement-specific sign-off pending |
| FR-FIL-002 | External file storage | Retained | migrations.test.ts; routes-and-api.spec.ts; media.test.ts | Requirement-specific sign-off pending |
| FR-FIL-003 | Provider abstraction | Retained | migrations.test.ts; routes-and-api.spec.ts; media.test.ts | Requirement-specific sign-off pending |
| FR-FIL-004 | Upload reliability | Retained | migrations.test.ts; routes-and-api.spec.ts; media.test.ts | Requirement-specific sign-off pending |
| FR-FIL-005 | Approved version lock | Retained | migrations.test.ts; routes-and-api.spec.ts; media.test.ts | Requirement-specific sign-off pending |
| FR-FIL-006 | Archive defaults | Retained | migrations.test.ts; routes-and-api.spec.ts; media.test.ts | Requirement-specific sign-off pending |
| FR-FIL-007 | Manager override | Retained | migrations.test.ts; routes-and-api.spec.ts; media.test.ts | Requirement-specific sign-off pending |
| FR-FIL-008 | Draft retention | Retained | migrations.test.ts; routes-and-api.spec.ts; media.test.ts | Requirement-specific sign-off pending |
| FR-FIL-009 | Storage health | Retained | migrations.test.ts; routes-and-api.spec.ts; media.test.ts | Requirement-specific sign-off pending |
| FR-RVW-001 | No-login access | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-002 | Logical task review hub | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-003 | Version selection | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-004 | Video comments | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-005 | Audio comments | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-006 | Image comments | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-007 | PDF comments | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-008 | Reviewer identity | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-009 | Threading and resolution | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-010 | Feedback state transition | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-011 | No client approval button | Amended by CR-002 | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-012 | Internal approval action | Amended by CR-002 | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-013 | Share controls | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-RVW-014 | Download control | Retained | golden.spec.ts; migrations.test.ts | Requirement-specific sign-off pending |
| FR-FIN-001 | Project budget | Retained | supporting.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-FIN-002 | Quotation draft | Retained | supporting.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-FIN-003 | Manual override | Retained | supporting.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-FIN-004 | Quotation versions | Retained | supporting.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-FIN-005 | Invoice status | Retained | supporting.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-FIN-006 | No accounting ledger | Amended by CR-002 | supporting.spec.ts; domain.test.ts | Requirement-specific sign-off pending |
| FR-OPS-001 | Manager dashboard | Retained | crm-surfaces.spec.ts; runner.test.ts | Requirement-specific sign-off pending |
| FR-OPS-002 | Employee dashboard | Retained | crm-surfaces.spec.ts; runner.test.ts | Requirement-specific sign-off pending |
| FR-OPS-003 | Temporary dashboard | Retained | crm-surfaces.spec.ts; runner.test.ts | Requirement-specific sign-off pending |
| FR-OPS-004 | Global search | Retained | crm-surfaces.spec.ts; runner.test.ts | Requirement-specific sign-off pending |
| FR-OPS-005 | Saved filters/views | Retained | crm-surfaces.spec.ts; runner.test.ts | Requirement-specific sign-off pending |
| FR-OPS-006 | In-app notifications | Retained | crm-surfaces.spec.ts; runner.test.ts | Requirement-specific sign-off pending |
| FR-OPS-007 | Email notifications | Retained | crm-surfaces.spec.ts; runner.test.ts | Requirement-specific sign-off pending |
| FR-OPS-008 | WhatsApp sending | Retained | crm-surfaces.spec.ts; runner.test.ts | Requirement-specific sign-off pending |
| FR-OPS-009 | Audit log | Retained | crm-surfaces.spec.ts; runner.test.ts | Requirement-specific sign-off pending |

## Business rules and nonfunctional gates

- **BR-001** — Only deliberately forwarded or manually captured content enters the Intake Inbox; the system does not ingest full personal inboxes or chat histories. Disposition: retained; rule-specific acceptance pending.
- **BR-002** — AI output is always a suggestion. A human manager confirms any client, project, deliverable, task, date, owner, budget or workflow decision. Disposition: retained; rule-specific acceptance pending.
- **BR-003** — Any authorised manager may process intake and approve/reject proposals. Disposition: retained; rule-specific acceptance pending.
- **BR-004** — Project activation requires complete minimum setup and explicit manager confirmation. Disposition: retained; rule-specific acceptance pending.
- **BR-005** — Every task has one and only one primary owner; collaborators never replace accountability. Disposition: retained; rule-specific acceptance pending.
- **BR-006** — Collaborators cannot change task status. Managers can override with audit reason. Disposition: retained; rule-specific acceptance pending.
- **BR-007** — One project workflow applies to all tasks in the project. Disposition: retained; rule-specific acceptance pending.
- **BR-008** — A workflow stage with tasks cannot be deleted until tasks are migrated. Disposition: retained; rule-specific acceptance pending.
- **BR-009** — Client Feedback Received is reserved and cannot be removed from the system. Disposition: retained; rule-specific acceptance pending.
- **BR-010** — Review links are never auto-sent. Entering Client Review only prepares a share. Disposition: retained; rule-specific acceptance pending.
- **BR-011** — Each review share is immutable and version-pinned; newer uploads do not alter an earlier share. Disposition: retained; rule-specific acceptance pending.
- **BR-012** — The client cannot approve inside the portal. Internal primary owner/manager records approval. Disposition: amended by CR-002; rule-specific acceptance pending.
- **BR-013** — Marking approval automatically completes the task and locks the approved version. Disposition: amended by CR-002; rule-specific acceptance pending.
- **BR-014** — All tasks complete makes a deliverable Ready for Manager Confirmation, not Completed. Disposition: retained; rule-specific acceptance pending.
- **BR-015** — All deliverables confirmed makes a project Ready for Final Closure, not Completed. Disposition: retained; rule-specific acceptance pending.
- **BR-016** — Only final approved files are copied into the final archive by default. Disposition: retained; rule-specific acceptance pending.
- **BR-017** — Productivity reporting must not expose a single employee rank or score. It must show operational context and trends. Disposition: retained; rule-specific acceptance pending.
- **BR-018** — Temporary freelancer access is expiry-based and assignment-scoped; full freelancer management is not in MVP. Disposition: retained; rule-specific acceptance pending.
- **BR-019** — Rate-card values are defaults. Managers may override quotation lines without retroactively changing the rate card. Disposition: retained; rule-specific acceptance pending.
- **BR-020** — Storage provider choice must not affect core project, version or review data models. Disposition: retained; rule-specific acceptance pending.

Security/isolation, p95 API <750 ms, interaction response <100 ms, RPO ≤24 hours, recovery ≤4 hours, keyboard/screen-reader/reduced-motion checks and four-format mobile review require retained staging artifacts. Do not infer these results from local unit tests or a fixture media inspector.

## Evidence recording procedure

For each row record exact requirement clause, business scenario, result, release SHA, test/artifact URL, environment and accountable reviewer. Record browser-expanded cases separately from business scenarios. Mark a row accepted only after its retained clauses and negative paths have evidence; unresolved P0/P1 defects block release. No implementation score is promoted to a production-readiness percentage.
