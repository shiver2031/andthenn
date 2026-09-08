# Production release approval packet

Status: **NO-GO pending organization-owned evidence and sign-off.** Local acceptance is not production certification. No production deployment or grants were performed by this implementation session.

## Prepare the immutable release

1. Review the current working tree, including the preserved earlier CRM implementation. Commit the intended baseline and run CI from a clean checkout. Record the full SHA; historical logs from a different tree are not release evidence.
2. Run `pnpm check:fast`, `pnpm exec turbo test --force`, `pnpm acceptance:prototype`, and `git diff --check`. Acceptance uses six isolated browser environments, one database/storage/queue per browser execution unit, workers=1 and retries=0. Preserve result JSON, traces and screenshots. Count business scenarios separately from expanded browser cases.
3. Build web, worker and migration images from that same SHA using their checked-in Dockerfiles. Retain immutable registry digests and provenance. Deploy those same images and unchanged migrations to AndThenn-owned staging with real PGMQ.
4. Verify clean install and upgrade, readiness before/after 0013, Data API privileges, Supabase/Google authentication, invite-only access, session revocation, Gmail reconciliation/deduplication, WhatsApp ordering/media/manual fallback, confirmed outbound sends, real scanner/storage across video/audio/image/PDF, retries and immutable history.
5. Restore database and storage, replay queues and archives, rotate credentials and exercise alerts. Retain measured RPO ≤24 hours and recovery ≤4 hours. Measure p95 non-provider APIs <750 ms and interaction response <100 ms with representative volume. Complete serious/critical Axe checks plus manual keyboard, screen-reader, focus, reduced-motion and four-format mobile review. Obtain named persona UAT.

## External approval record

Copy `docs/release-approvals.json` to an externally controlled release record. Keep all 14 keys (the legacy `standalone-task-scope` key now records the accepted **project/output-linked** task scope). Set `releaseCommit` to the exact full SHA. Each approval requires `status: "approved"`, named `approvedBy`, ISO `approvedAt`, and an evidence link. Never substitute implementation presence for approval.

Add:

```json
{
  "artifacts": {
    "webImage": "REGISTRY/andthenn-web@sha256:64_HEX_DIGEST",
    "workerImage": "REGISTRY/andthenn-worker@sha256:64_HEX_DIGEST",
    "migrationImage": "REGISTRY/andthenn-migrations@sha256:64_HEX_DIGEST"
  },
  "checks": {
    "quality": { "status": "passed", "releaseCommit": "FULL_SHA", "evidence": "REVIEWED_EVIDENCE_URL" }
  }
}
```

Supply the same exact-commit evidence structure for `browser`, `migrations`, `authentication`, `providers`, `storage`, `recovery`, `performance`, `accessibility`, `data-api`, and `uat`. Promotion also requires `canary` evidence. The script validates completeness; the release owner verifies evidence contents and signatory identities.

| Accountable owner | Approvals |
|---|---|
| Organization administrator/data owner | Production role mapping, Client access grants |
| Founder/finance owner | Manager finance grants, finance definitions |
| Product owner | Project/output-linked task scope |
| Data/privacy owner | Retention and privacy |
| Platform/release owner | Platform ownership, provider sandboxes, backup/recovery |
| Engineering/QA owner | Performance and accessibility |
| Named persona representatives | Founder, Manager, Designer and Client UAT |

## Protected deployment process

The new `.github/workflows/production-release.yml` is a dispatch-only deployment entrypoint with a protected `production` environment. It checks successful quality CI for the requested SHA, fetches the external approval packet from an AndThenn-owned `gs://` object, invokes `release:gate` through `production-release.mjs` before migration/traffic changes, and uses only approved image digests.

Platform setup is required before it is usable: protect the production environment with named release reviewers and deployment-branch rules; protect workflow/script changes; restrict Workload Identity and the deployment service account to that environment/repository/ref; remove alternate deployment credentials; configure `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_RELEASE_SERVICE_ACCOUNT`, and `GCP_MIGRATION_JOB`. Services currently follow the repository names `andthenn-web` and `andthenn-worker`. Review and test this configuration in staging. No claim is made that these remote controls are configured.

Run the workflow in `canary` mode only after staging certification and compatibility review. The packet must include passing exact-commit `checks.compatibility` evidence and `compatibleBaseline.webImages` / `compatibleBaseline.workerImages` arrays naming the tested currently serving image references. Unlisted baselines fail before migrations. It executes migrations, stages the candidate web revision without traffic, checks readiness, updates the worker, and moves 5% of web traffic. Monitor authorization, workflow decisions, queue lag, scanner failures, download denials and archive errors. Halt and investigate on any such regression. After named canary acceptance and evidence, `promote` verifies the candidate digest before moving to 100%.

The first deployment crossing 0013 cannot use an older web/worker baseline that treats internal approval as final. Rehearse a compatible bridge/forward-fix or a controlled no-traffic cutover first. Never roll back to that incompatible interpretation. Stop destructive retention until approved durations and restore behavior are verified.

## Client provisioning operator process

Use the approved invite-only authentication administration process to create/link an organization Client membership to the correct client record. Verify identity, role and organization against the approved mapping. Grant only named projects through the project access editor; a linked Client membership alone does not imply project access. Sign in as the Client to verify granted navigation/review/downloads and denial for another client/project. Revoke the grant and confirm an already-open session loses metadata, preview, decision and byte access. Retain the operator and acceptance record. Automated invitations are not required for this release.

## Legacy approvals and recovery

Production defaults to clean start subject to role-mapping approval. For upgrades, inspect `approval_reconciliation_queue`; ambiguous historical approvals remain LEGACY_UNVERIFIED. Preserve them, find attributable evidence or request a fresh decision, and publish explicitly. Never backfill missing Client approval or publication provenance. Archive manifests must match current final versions and checksums; a historical successful job alone cannot close a project.

Manual preflight: `RELEASE_REQUIRE_ARTIFACTS=1 RELEASE_APPROVAL_PATH=/absolute/path/to/reviewed.json pnpm release:gate`. Pending approvals, mismatched SHA or a dirty checkout must fail. Gate success is not itself staging certification, an authorization signature, or proof of platform IAM configuration.
