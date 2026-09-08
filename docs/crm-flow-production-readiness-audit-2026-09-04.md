# CRM Flow production readiness audit

Audit date: 4 September 2026. Release decision: **NO-GO**. Estimated CRM implementation completion: **75% (±5 percentage points)**.

The CRM flow is substantially implemented, and its checked-in local regression passes. It is not blocked only by paperwork or untested edge cases: independent browser checks reproduced an assignment-accountability bypass, premature final-file publication, and unfinished navigation/state behaviour. These defects must be closed alongside the previously recorded staging, coverage and approval gates.

## Scope and source precedence

The primary CRM acceptance source is [CRM Flow.docx](/Users/Shiva_1/Desktop/AndThenn/CRM%20Flow.docx), especially sections 2–6, 8–14 and 17–18, including its status and assigner/assignee tables. I cross-checked [the original ERP PRD](/Users/Shiva_1/Desktop/AndThenn/AndThenn_Media_ERP_PRD_v1.0.docx), [the root master plan](/Users/Shiva_1/Desktop/AndThenn/PLAN.md), the September 2 CRM plan, September 3 audit, September 4 progress addendum, release packet, application/server code, migrations and tests. The initial Agency Product Vision is background, not authority to reintroduce features subsequently excluded by the PRD.

The newer CRM document is treated as the intended functional direction. This is not a certification of every one of the original PRD's 101 requirements. The original PRD requires formal change control; its conflicts with the CRM implementation still need an approved reconciliation, described below.

Audited base commit: `3b60513a50015fe305af722bf08177a58b489675`, **plus the existing uncommitted working tree**. The base commit alone does not contain the implementation audited here. Existing implementation changes were preserved; no application fix, production mutation, provider send, production role change or deployment was performed. Browser mutations used a separate disposable local database, not the user's persistent `.prototype` workspace.

## Fresh verification

| Check | Actual result | What it establishes |
| --- | --- | --- |
| `pnpm check:fast` | Passed | Lint, typecheck, tests and production build; three existing console lint warnings remain. Some tasks reused Turbo cache. |
| `pnpm exec turbo test --force` | Passed, 44 tests | Fresh unit/integration execution with cache bypass, including real embedded-PostgreSQL journal migration testing. |
| `pnpm acceptance:prototype` | 58 passed, 6 skipped, no failures/flakes; 98.1 seconds | The checked-in suite passes on this working tree. Retries are disabled. |
| `pnpm release:gate` | Exit 1, RELEASE BLOCKED | Missing exact release commit, dirty checkout, and all 14 required approvals pending. |
| `git diff --check` | Passed | No whitespace errors; not a functional certification. |
| Independent interactive browser | Reproductions below | Checked role Homes, assignment edits/completion, Client review/final access, Client navigation, search and cross-client denial. |

Browser regression evidence is in [prototype-results.json](/Users/Shiva_1/Desktop/AndThenn/test-results/prototype-results.json). Independent screenshots are in [the audit evidence directory](/Users/Shiva_1/Desktop/AndThenn/test-results/crm-audit). These are local QA artifacts, not provider or staging evidence.

There are **16 distinct browser test definitions**, expanded to 64 scheduled cases across four browser projects. Golden and supporting-data journeys execute only in desktop Chromium; their other six instances are explicitly skipped. The Manager route smoke test also loops through 375, 768, 1024 and 1440 widths. Therefore it would be incorrect either to call this 58 distinct business scenarios or to claim that 768/1024 receive no testing. Full journey/action coverage at those widths, and the golden journey on WebKit/mobile, remain incomplete.

The prototype substitutes PGMQ functions, uses local persona authentication/storage, and permits media processing for an exact bundled fixture checksum. The separate migration integration test uses Drizzle's journal migrator but removes the unavailable PGMQ extension declaration. Neither certifies the production image, Supabase authentication, real PGMQ or a production malware/media scanner. The passing golden test follows one path; it does not prove that invalid shortcuts are rejected.

## Verified implementation defects

### CRM-R1 P1 Task edits replace the assigner and permit self-confirmation

Requirement: CRM sections 6, 8 and 12, including the accountability table, require persistent assigned-by/date and completion confirmation by the assigner. The September plan requires one request/confirmation contract.

Browser reproduction, using only normal UI:

1. Manager Rohan created `Audit accountability reproduction`, assigned to Designer Arjun.
2. Task detail displayed `Assigned by Rohan Bose`.
3. Arjun opened the project quick task editor and changed **only the brief**; the primary owner was unchanged.
4. After saving, task detail displayed `Assigned by Arjun Menon`.
5. Arjun requested completion and was then offered **Confirm completion** in the same session.
6. Confirmation succeeded and `COMPLETED` persisted after reload, without Rohan confirming.

Cause: [updateProjectTask](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/actions.ts:139) removes/recreates active assignment rows on every edit and overwrites `assignedAt` and `assignedByMembershipId` with the editor. [requestTaskCompletion](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/actions.ts:196) chooses that overwritten assigner as reviewer. This also changes Assigned by Me membership and clears pending review on ordinary edits. Historical audit entries may retain the original actor; the active accountability record nevertheless becomes wrong.

Exit criterion: non-assignment edits preserve assignment provenance and the designated reviewer; an assignee cannot acquire completion-review authority merely by editing text/date/priority. Actual reassignment must have explicit authority and a retained assignment history. Add browser and transactional regression tests for ordinary edits, pending requests, reassignment, original-assigner views and self-confirmation policy.

Evidence: [persisted self-confirmation screenshot](/Users/Shiva_1/Desktop/AndThenn/test-results/crm-audit/self-confirmation.png).

### CRM-R2 P1 Internal approval is conflated with Client approval and final delivery

Requirement: CRM section 14 and the accepted implementation direction distinguish internal review, Client review, feedback/changes, approval and final delivery.

Browser reproduction:

1. Client Riya's Home initially listed `aster-afterhours-v2.mp4` awaiting review; the authenticated final-file endpoint returned **404**.
2. Manager clicked **Approve** on the task's file version. The Client took no action.
3. After returning to Client Home, the queue said **“You're all caught up.”**
4. Client Files displayed **APPROVED FINAL** and the same final-file endpoint returned **200**.

The golden test itself uses this same Approve control as the internal-approval step before Client review. [Internal approval](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/tasks/review-actions.ts:411) and [Client approval](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/client-review-actions.ts:26) share `file_approvals`; [Client Home](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/home/page.tsx:16) excludes any active approval; [final-file classification](/Users/Shiva_1/Desktop/AndThenn/apps/web/lib/final-file.ts:4) treats any active locked approval as final. A subsequent Client approval can reuse the existing internal approval rather than establishing separate final-approval provenance.

Exit criterion: distinguish internal clearance from Client/final approval. Internal clearance must leave the Client decision outstanding and must not expose a final download. If recording externally obtained Client approval remains supported, it needs an explicit, audited action and product-approved semantics. Test pending Home queue, approval identity, changes/new version, authenticated downloads and closure eligibility together.

Evidence: [Client queue after internal approval](/Users/Shiva_1/Desktop/AndThenn/test-results/crm-audit/client-pending-empty.png), [premature final on mobile](/Users/Shiva_1/Desktop/AndThenn/test-results/crm-audit/premature-final-mobile.png).

This is a workflow-gating defect, not a reproduced cross-client data leak: Client Dev still received 404 for Aster's project and file in the independent browser check.

### CRM-R3 P2 The legacy project list contradicts completed task state

After CRM-R1's task completed, its task detail correctly showed `COMPLETED`, but the project's task table displayed `WORKFLOW` in the **Status** column. [The list query](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/projects/page.tsx:24) does not read execution status and falls back to `Workflow` when completion clears the workflow-stage ID. The legacy page is still linked from Home, so this is not unreachable old code.

Exit criterion: all live project/task/Home/report surfaces display the same execution status, with workflow phase separately labelled. Add reload reconciliation assertions, including completed and feedback states.

### CRM-R4 P2 Client My Projects is a navigation dead end

From Client Home, clicking the primary **My Projects** navigation opens `/projects`, an internal-style accordion with zero visible tasks. There are **no links in the main content** to `/projects/[id]`, so the Client cannot reach reviews, outputs and final deliveries through this navigation. The canonical workspace is usable from Home's project cards, which is why existing tests still pass.

Cause: [ProjectsPage](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/projects/page.tsx:25) removes Client task rows but still renders [ProjectWorkspace](/Users/Shiva_1/Desktop/AndThenn/apps/web/components/project-workspace.tsx:22), whose project click expands a query-param view instead of opening the canonical workspace.

Exit criterion: My Projects lists only granted projects and opens their canonical Client workspace directly, with empty/revoked states and mobile coverage. Evidence: [Client My Projects on mobile](/Users/Shiva_1/Desktop/AndThenn/test-results/crm-audit/client-projects-mobile.png).

### CRM-R5 P2 Role Homes do not yet implement the required content

Independent browser checks and code agree:

- Founder and Manager render the same `ManagerHome` and essentially identical content. Founder Home lacks the requested own-work, Team availability/load and Accounts summaries; Manager Home lacks its own-work and Team-load sections. The separate Accounts and Team pages exist, but that does not complete the Home contract.
- Designer Home contains only **Needs attention / This week / Upcoming**. It does not provide the requested **Due Today / Due Tomorrow / Waiting for Feedback / Completed** groups. Completed tasks are explicitly removed before rendering, rather than available in the planned collapsed Completed group.
- Home's project health only represents **On track / At risk**; canonical project detail additionally derives **Blocked / Waiting**, giving different health descriptions across surfaces.
- Work list rows omit assigned-by/date and displayed priority, although task detail shows them. The requirement explicitly calls for these accountability fields in My Tasks.
- A shared attention helper now exists, but it is not proof of complete consistency: it uses a rolling next-24-hours reason instead of local calendar Due Today, recognizes Client Review rather than all approval/review needs, and Home applies additional filters/truncation.

Sources: [Home role routing/filtering](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/home/page.tsx:12), [Designer groups](/Users/Shiva_1/Desktop/AndThenn/apps/web/components/assigned-work-home.tsx:17), [Manager read model](/Users/Shiva_1/Desktop/AndThenn/apps/web/lib/manager-overview.ts:80), [attention model](/Users/Shiva_1/Desktop/AndThenn/apps/web/lib/task-attention.ts:6), [Work](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/work/page.tsx:19).

Exit criterion: implement or explicitly approve deviations from CRM sections 2–4, 6, 13 and 15; reconcile queue contents, calendar-day definitions and health against a shared read model. Evidence: [Founder Home](/Users/Shiva_1/Desktop/AndThenn/test-results/crm-audit/founder-home.png), [Designer Home](/Users/Shiva_1/Desktop/AndThenn/test-results/crm-audit/designer-home.png).

### CRM-R6 P2 Project discussion and authorized destinations remain incomplete

The Designer's canonical project workspace exposes activity, but no discussion/comment/mention composer (zero forms/textareas in the inspected project). Task discussion and checkbox-based teammate notifications work; they do not satisfy CRM section 9's project-discussion and feedback mention surfaces.

A Designer search for `Rohan` returned a person result linking to `/team`; clicking it redirected to Home because Designers cannot access Team. [People search](/Users/Shiva_1/Desktop/AndThenn/apps/web/app/%28erp%29/search/page.tsx:31) uses that same destination for every role. Notification links are implemented only for task objects, and lost-access notification bodies remain a review item.

Source inspection also shows clients in global search are derived from matching project rows, so a client with no project is not a searchable client result. Intake, proposal, deliverable and comment search sources required by original PRD FR-OPS-004 are not implemented in this search page. Either retain those original requirements in the acceptance matrix or explicitly approve their removal; do not silently equate the narrower CRM search with full PRD compliance.

Exit criterion: complete the intended discussion/mention contexts, ensure each rendered search/notification destination is accessible and meaningful, and cover lost-access and zero-project-client cases. No new messaging system is required.

## Remaining production gates

### Required decisions and named approvals

The checked-in [approval record](/Users/Shiva_1/Desktop/AndThenn/docs/release-approvals.json) contains **0 of 14 approved entries**. This proves the provided packet is incomplete, not that no person has given approval elsewhere. Any external approval must be supplied, reviewed and associated with the exact release commit.

| Pending approval | Required accountable owner and evidence |
| --- | --- |
| production-role-mapping | Organization administrator/leadership: named Founder, Manager, Designer memberships, temporary dates, and clean-start versus migration policy. Never promote all Managers automatically. |
| client-access-grants | Client/data owner: named Client identities, client links, project/file/review grants, provisioning owner, invite/revocation process and session behaviour. |
| manager-finance-grants | Founder/finance owner: explicit authorized Managers; default denial and granted behaviour demonstrated. |
| finance-definitions | Finance owner: supported currencies, expense categories, paid/partial revenue treatment, quote selection, taxes/GST wording and gross-profit definition. |
| standalone-task-scope | Product owner: decide whether internal tasks may be project-independent. Current tasks require project/output lineage; this is not automatically a defect if that scope is approved. |
| retention-privacy | Data/privacy owner: message, draft, review, audit and archive retention; guest-link lifetime/download rules; deletion/recovery; provider data terms. |
| platform-ownership | Platform/release owner: AndThenn-owned GCP/Supabase/billing, domain/DNS, Gmail, Meta, storage, secrets and monitoring/recovery contacts. |
| provider-sandboxes | Platform/integration owner: real authentication, intake, explicit send, scanner, storage and queue evidence, including failures and retry/recovery. |
| backup-recovery | Platform owner: measured database/storage restore, replay/recovery, credential rotation and alert delivery. |
| performance-accessibility | Engineering/QA owner: representative-volume performance and complete accessibility/browser evidence. |
| uat-founder | Named Founder representative: company Home, own work, approvals, Team and Accounts. |
| uat-manager | Named Manager representative: daily work, client service, assignments, exceptions and closure. |
| uat-designer | Named Designer representative: own/assigned-by-me tasks, comments, review, completion and mobile work. |
| uat-client | Named Client representative: project access, reviews, feedback, approval, final files and revocation. |

Production Client provisioning is not automated by the new grant editor: it operates on **already-linked Client memberships**. A tested operator provisioning process can satisfy this requirement; an additional automated invite feature is not assumed mandatory without a product decision.

### Reconcile the original PRD before sign-off

The original PRD's approval/change-control section requires recorded change requests for permissions, workflow, review and finance changes. Only a theme change request was found in `docs/decisions`.

Explicitly ratify at least:

- **Client portal and approvals:** original FR-RVW-011 and BR-012 prohibit client approval and the PRD limits clients to no-login review; the CRM interpretation adds authenticated Client projects and decisions.
- **Completion:** original FR-WFL-007, FR-RVW-012 and BR-013 make approval automatically complete work; the CRM accountability contract separates approval from requested/confirmed completion.
- **Finance/roles:** original Managers own finance and FR-FIN-006 excludes expenses/profitability; the CRM makes finance Founder-led/Manager-granted and adds expenses/profit summaries.
- **Hierarchy:** original FR-TSK-002 requires a deliverable for every task; approve the standalone-task decision explicitly rather than inventing holding projects.

The newer document can authorize a revised product direction, but it does not by itself provide a reconciled, testable requirement-by-requirement release baseline. These conflicts should not be “fixed” by blindly reverting the CRM implementation to August behaviour.

### Staging and provider evidence

Required before traffic is released:

1. Build and deploy the **reviewed release image**, run the unchanged journal migrations from the prior schema and clean installation with real PGMQ, and demonstrate readiness failure before 0012 and success after it. Rehearse the forward-fix/rollback procedure.
2. Verify Google/Supabase login, invite-only permanent and temporary accounts, reset/session revocation and actual production role grants. Prototype persona switching is not authentication evidence.
3. Verify real Gmail ingestion/reconciliation/deduplication, WhatsApp ordering/media and manual fallback, and explicitly confirmed outbound review sends. Check disabled-AI fallback and approved AI/transcription behaviour if enabled.
4. Verify actual storage upload/download permissions, malware/type inspection, processing failures/retries, immutable/pinned versions and archive checksum/manifests. The one whitelisted MP4 fixture is not scanner certification or four-format certification.
5. Prove backup restore and the runbook's RPO ≤24h / recovery ≤4h targets, credential rotation, queue recovery, archive retry, and alert delivery to the accountable team.
6. Measure the agreed p95 non-provider API budget (<750ms) and interaction target (<100ms) on representative volumes; perform keyboard, screen-reader, reduced-motion and four-format mobile review checks. Route rendering plus one Home Axe scan is insufficient.
7. Confirm prototype/review persona modes are not used for the production data environment. Verify Supabase browser Data API privileges after all migrations, including new 0012 tables; local application-route denial is not a substitute for deployed grant checks.

No organization-owned staging URL, signed provider results, restore results or persona acceptance record was evidenced in the supplied release packet or verified in this audit. These remain **unverified gates**, not claims that the providers are necessarily broken.

### Remaining exhaustive test coverage

- Full cross-organization and cross-client **pages, actions, APIs, exports, metadata and byte access** matrix. Existing browser seed contains one organization/two Clients; migration tests cover only selected cross-organization relationships.
- Temporary start/expiry, deactivation and revocation **during already-open sessions**, including task/file/review/search/notification access and former assignments. The golden test does cover one open-session Client project revocation; do not mark all revocation coverage absent.
- Ungranted and granted Manager finance matrix and explicit Designer/Client/temporary denial across routes, actions and exports.
- Assignment edit provenance, no-op/detail edits, pending-request edits, reassignment, inactive/future reviewer fallback, takeover, simultaneous confirmation and all reopen/archive/closure races. Existing concurrency test proves only one stale-editor case.
- Every setup edit/autosave, close, reload/resume, Save/Discard/Stay, conflict, validation and network-failure/retry path.
- Mention deduplication and recipients losing access; all intended search sources, pagination, destination access, notification object types and revoked-link behaviour.
- Video/audio/image/PDF review and uploads, unsupported/malicious media, interrupted uploads, provider outages, superseded/historical versions, revoked/expired guest shares and download restrictions.
- Full golden and supporting mutation journeys on WebKit and mobile, not just route smoke. Preserve intermediate assertions that internal approval is not Client approval and edit is not reassignment.
- End-to-end reconciliation of task status/phase, deliverables, project closure, Home/Work queues, Team estimates/capacity exceptions and Accounts. Accounts currently counts full PAID invoice amounts as revenue and portfolios sum INR only; prove and approve these operational definitions rather than treating them as certified accounting.
- Deterministic clocks/locales and isolation suitable for the intended CI parallelism. Current acceptance serializes one shared seeded database across browser projects.

### Release artifact and operational enforcement

The checkout is dirty and the pending manifest has `releaseCommit: null`. Preserve the work, review it, commit the intended release, rerun gates on a clean checkout and attach evidence to that exact SHA. Remote CI success was not verified here.

[release-gate.mjs](/Users/Shiva_1/Desktop/AndThenn/scripts/release-gate.mjs) checks record completeness, timestamp and commit/worktree state. It does **not** authenticate the signatory, inspect evidence contents, validate all required tests, or prevent an external deployer bypassing it. The current quality workflow does not invoke it as a deployment gate. The release owner must verify the record and enforce it in the approved production deployment process.

Refresh stale acceptance/traceability documents for the new baseline. August's failure counts and September 3's 35% estimate are historical, not current results.

## Completion grade

This is an engineering estimate of **implemented CRM outcomes**, not line/branch coverage, passed-tests divided by scheduled tests, or a production-readiness percentage. Missing signatures do not mean the feature code is absent. Conversely, code presence and a happy-path pass do not earn full credit when invalid paths defeat the requirement.

| Requirement area | Weight | Estimated completion | Weighted contribution |
| --- | ---: | ---: | ---: |
| Shared roles, scoped resources and schema foundation | 20% | 85% | 17.00 |
| Universal assignment, accountability, status and completion | 25% | 65% | 16.25 |
| Brief → setup → work → review → Client → delivery/closure | 25% | 80% | 20.00 |
| Role Homes, My Work and Needs Attention | 15% | 60% | 9.00 |
| Client/brand, Team, Files, Accounts, search and notifications | 10% | 80% | 8.00 |
| Baseline build, error handling and local reliability | 5% | 90% | 4.50 |
| **Overall** | **100%** | **74.75%, rounded to 75%** | **74.75** |

Uncertainty: approximately ±5 percentage points because several edge-case and provider paths remain unevidenced. This is not a statistical confidence interval.

Important progress since September 3: 0012 is journaled and upgrade-tested locally; shared resource checks and authenticated Client isolation exist; universal task creation/discussion/mentions are reachable; text/media request-confirm completion and local archive/closure paths exist; Accounts corrections, Team load, Client grants and release-record validation have been added. The previous 35% assessment materially understates today's implementation.

**Production exit:** fix CRM-R1/R2; resolve CRM-R3–R6 against the agreed acceptance baseline; complete the security/concurrency/provider/accessibility/recovery evidence; ratify requirement changes; obtain all 14 named approvals; and release only the exact reviewed, tested commit through the controlled deployment process. No GO recommendation while P0/P1 defects remain.
