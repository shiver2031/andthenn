# CRM implementation handover — 5 September 2026

The CRM completion changes are implemented on `codex/crm-flow-completion`, extending and preserving the existing CRM work. **This is not a declaration of 100% functional acceptance or production readiness.** The original 75% estimate is not recalculated from code presence or test counts.

## Delivered changes

- Assignment updates compare actual membership changes, preserve unchanged assignment provenance and pending reviewers, retain audit history, and invalidate requests on primary reassignment. Self-assigned work needs independent confirmation; leadership can designate a reviewer with a recorded reason.
- Migration 0013 separates internal clearance, portal/external Client approval, and durable explicit final publication. Legacy approvals are retained as unverified in a reconciliation queue. The current-final view is shared by metadata, downloads, Client surfaces and archives.
- Media-delivery tasks explicitly require Client approval and publication before completion, including before an initial upload exists. Administrative tasks can complete through request/independent confirmation without artificial media. Phase changes cannot substitute for Client approval or publication.
- Project locks serialize workflow mutations with completion/closure. Candidate replacement, Client changes and reopening invalidate relevant current eligibility. Archive closure checks exact final-version membership and checksums.
- Role Homes, Work accountability summaries, canonical Client project navigation, calendar-day queues, Team commitments and operational finance use shared read models. Founder Home, Accounts, project finance and finance CSV share PAID-only revenue, separate partial invoice totals/currencies, latest and accepted quotations, expenses and labelled margins.
- Project/task/version discussions retain replies and authorized mentions. Search covers clients directly, intake, proposals, projects, outputs, tasks, files, comments and permitted people. Notification destinations are resolved against current access; inaccessible previews become neutral.
- Action forms retain entered data on validation/stale-write errors. Client changes close the current clearance cycle; repeated approval is rejected. Historical guest comments cannot change current Client-approved workflow.
- Six-browser acceptance runs use isolated database/storage/queue fixtures per browser execution unit, one worker, no retries/skips, and retain screenshots/traces/results. The aggregate report records the source SHA and clean-checkout state.
- Dockerfiles and a protected deployment workflow enforce external approval/evidence checks before migrations or traffic changes. The rollout also requires an explicitly approved compatible serving baseline, readiness and a separately accepted canary.

## Verification and limits

Use the latest `test-results/prototype-results.json` for actual browser results, SHA and clean-checkout state. Earlier intermediate runs intentionally exposed regressions and must not be substituted for the final run. The suite currently contains 21 distinct browser scenarios expanded over Chromium at 375/768/1024/1440 and WebKit at 375/1440; scenario names are retained in each report. Unit/database/worker and release-gate tests are separate counts.

Coverage includes both full portal/external delivery-to-archive journeys, internal and Client changes, denied early downloads/completion, assignment provenance, independent self-assigned confirmation, competing confirmations and status edits, access revocation, two-organization isolation, role navigation/search/discussions, invalid/stale form preservation and expense correction. Migration tests cover 0011 →0012 →0013, preserved legacy approvals, clean install, replay, tenant constraints, immutable versions and denied Data API table access. Embedded Postgres substitutes PGMQ for local acceptance; real PGMQ is a staging gate.

These scenarios do not establish all retained PRD clauses or every specified concurrency/failure permutation. The [requirement register](traceability/crm-completion-register-2026-09-05.md) explicitly keeps requirement-level acceptance pending. Full forced-network/setup-recovery coverage, the complete reviewer expiry/takeover and workflow concurrency matrix, deterministic server/database clocks, all-format malicious/scanner failures and manual assistive-technology evidence still need completion/evidence before certification. No such requirement is silently waived by a passing aggregate browser result.

## Production remains blocked

No production deployment, provider send, Client provisioning, credential change, migration against production, or external approval was performed. Docker and gcloud were not available in this local environment; deployment images/workflow require staging rehearsal. The repository approval template remains pending and `release:gate` fails closed.

The release owner must supply AndThenn-owned staging/platform access, the real provider/storage/scanner configuration, exact image digests, named role/client/finance mappings, restore/queue/rotation/alert evidence, representative performance results, full accessibility and persona UAT, and all 14 externally retained approvals. Configure and verify protected environment/IAM controls before dispatching the deployment workflow. Do not run a canary against an old baseline that interprets internal clearance as final delivery.

Follow [the release guide](production-release-approval-guide.md), [CR-002](decisions/PRD-CR-002-crm-accountability.md), and the requirement register. Retain the clean-start default subject to approved role mapping; keep destructive retention disabled. Only the exact tested and approved release can be promoted to production.
