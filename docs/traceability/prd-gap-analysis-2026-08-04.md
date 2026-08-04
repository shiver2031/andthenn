# PRD feature gap analysis — 04 August 2026

Baseline: `AndThenn_Media_ERP_PRD_v1.0.docx` — 101 functional requirements, 20 business rules, 12 critical end-to-end scenarios, and 10 release gates.

## Summary

- **Accepted PRD requirements: 0/101.** The PRD and local traceability definition require credential-backed staging and manager UAT for acceptance; neither exists in this environment.
- **Critical scenarios passing end to end: 0/12.** Some domain functions or static surfaces exist, but no scenario completes through the application.
- **Visible surfaces:** 14 tested routes render across four breakpoints, with one mobile overflow defect.
- **Functional interactions:** only navigation, a handful of local toggles, desktop review playback/marker selection, and four HTTP boundary behaviors were verified.
- The existing `docs/traceability/prd-matrix.md` labels every group “implemented” when a schema, code symbol, or route exists. That is not the PRD's definition of a working feature and is contradicted by this audit.

## Functional-requirement diff

| PRD area | IDs | What exists now | Difference from the PRD |
|---|---|---|---|
| Identity and access | FR-IAM-001–007 | Login page, static manager identity, schema/domain authorization helpers and tests | Both login actions are inert. Invite-only auth, sessions, deactivation, manager protection, role UI/API enforcement, and credential-backed permanent/temp scoping are not demonstrable. |
| Clients and rate cards | FR-CLT-001–005 | Static client table and database schema | Search does not filter; Add client is inert. No usable client/brand/contact CRUD, archive, dated rate-card history, selectors, or client activity history. |
| Intake | FR-INT-001–010 | Four static inbox rows, raw-evidence presentation, editable-looking brief, local claim toggle, Gmail/WhatsApp endpoint code | Row selection does not update details. Filters, attachments, manual capture, save, dedupe, grouping/splitting, locking/takeover, conversion, and persistence are absent or inert; provider flow is unconfigured. |
| Proposals | FR-PRP-001–005 | Static proposal cards and domain state concepts | New, review, reject, edit/history, manager approval, activation handoff, and linked rejected retention are not usable. |
| Projects | FR-PRJ-001–007 | Static project list, one workspace, local Board/List toggle | Search/create/actions/tabs are inert; every dynamic ID renders Monsoon Stories. No activation wizard, confirmed owner/deadline/budget/workflow, health explanation, notes/activity, real view consistency, or reopen flow. |
| Deliverables | FR-DLV-001–005 | Static progress and next-milestone text; domain closure helper | No deliverable creation/detail/lifecycle UI, lineage proof, task roll-up drill-down, Ready for Confirmation transition, manager confirmation, or audit trail. |
| Tasks | FR-TSK-001–009 | One hard-coded task detail, static assignee/stage/version/discussion | Move status, upload, and comment controls are inert. No create/edit, owner/collaborator enforcement through UI/API, priority filters, checklist, dependencies, bulk operations, or persistence. |
| Workflow | FR-WFL-001–007 | Static board columns and domain state-machine helpers | No activation workflow editor, one-workflow enforcement demonstration, rename/reorder/add/delete migration UI, reserved-feedback cycle, explicit share preparation, or completion/approval workflow. |
| Time and workload | FR-TME-001–008 | Static workload grid and calculation helpers | No time capture/correction/capacity settings. Week arrows, filters, cell drill-down, and export are inert; metrics cannot be reconciled to persisted tasks/time entries. |
| Files and storage | FR-FIL-001–009 | Static version ledger, upload/review API code, provider abstraction code | Upload UI is inert. No end-to-end immutable upload/version test, controlled asset open, resume/retry, approved-version lock, archive destination/override/draft exclusion, or storage-health recovery. |
| Client review | FR-RVW-001–014 | Public demo token, static V2 review UI, desktop simulated playback, local marker selection, mobile comments drawer, API validation; no client approval button | One static video-like demo is not a real four-format review. Feedback does not submit; identity/share/download/draw/fullscreen are inert; no two-token version proof, threading/resolution, feedback state notification, internal approval/lock, expiry/revocation proof, or reliable mobile playback. |
| Commercials | FR-FIN-001–006 | Static metrics/quotes and GST calculation helper | New quotation and export are inert. No project budget workflow, sourced draft, override reason, quote versions/history, invoice-status editing/filtering. The deliberate lack of a general ledger is consistent with FR-FIN-006. |
| Operations | FR-OPS-001–009 | Manager-style home, route shell, static reports/notifications/admin/search surfaces | Home decision cards and global search do not open records. No employee/temp dashboards, saved views, working notification preferences/links, outbound WhatsApp action, or usable audit log. |

## Critical-scenario diff

| PRD scenario | Current evidence | Result |
|---|---|---|
| Email-to-project | Webhook/adapter skeleton and static email intake row | **Fail** — attachment, claim-to-proposal, activation, persistence, and lineage cannot complete. |
| Unstructured WhatsApp request | Static WhatsApp row; unconfigured webhook returns 503 | **Fail** — no working capture/group/transcription/edit/conversion flow. |
| Task accountability | Domain authorization unit tests | **Fail** — no usable assignment/status/manager-override/audit UI flow. |
| Custom workflow | Static board and domain helper | **Fail** — no workflow editor or populated-stage migration flow. |
| Version-pinned review | Demo API reports V2 | **Fail** — no V1/V2 upload and simultaneous old/new token proof. |
| Client feedback cycle | Desktop marker selection | **Fail** — comment submission, feedback state, notification, approval, completion, and lock do not work. |
| Deliverable/project closure | Domain helper | **Fail** — confirmation, closure, archive destination, and audit path are unavailable. |
| Workload reporting | Static grid | **Fail** — settings, navigation, filters, drill-down, exports, and persisted reconciliation are unavailable. |
| Quotation automation | GST calculation unit test and static cards | **Fail** — rate-card draft, override, versioning, final output, and history are unavailable. |
| Temporary freelancer | Domain expiry/scope unit test | **Fail** — sign-in is inert and assignment/expiry/history cannot be exercised end to end. |
| Provider outage | WhatsApp produces a visible 503 | **Fail** — no visible retry queue, fallback action, recovery, or no-loss proof. |
| Ownership handover | Architecture, ADR, runbook, threat model, and deployment files exist | **Fail** — a new operator has not demonstrated deploy, restore, administration, and credential rotation. |

## Verified current feature inventory

Working in the tested production build:

- Root redirect and primary route navigation.
- Fourteen rendered application/review surfaces.
- Global search open/close and text entry, but not result navigation.
- Local claim/release for the initially displayed intake record.
- Local project Board/List view toggle.
- Desktop review play/pause and comment-marker selection.
- Mobile navigation and comments drawer.
- Health response, demo review response, invalid review-comment rejection, and explicit unconfigured-WhatsApp failure.
- Lint, TypeScript, source-only unit tests, and production build.

Everything else shown as a button, filter, tab, menu, export, creation action, status transition, upload, or comment action must remain unaccepted until it produces a persisted, authorized, auditable result and survives reload.
