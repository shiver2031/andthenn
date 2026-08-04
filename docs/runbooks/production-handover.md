# Production handover and recovery

## Ownership gate

Before production, confirm the GCP organization/project, Supabase organization/project and billing, domain/DNS, Gmail intake mailbox, Pub/Sub topic, Meta Business/phone number, Secret Manager secrets, recovery email/phone and monitoring destinations are AndThenn-owned. No developer-owned credential is acceptable.

## Deployment

1. Create the Supabase production project in Mumbai and enable PITR/backups.
2. Apply database migrations in order and run the seed only in a non-production workspace.
3. Push web and worker images to an AndThenn Artifact Registry repository.
4. Put secret values in Secret Manager; Terraform creates secret resources but never their versions.
5. Apply `infra` with a versioned remote GCS state backend.
6. Configure Supabase Google OAuth and invite-only email/password policy.
7. Configure Gmail delegated credentials, Pub/Sub push OIDC audience, daily watch renewal and reconciliation schedule.
8. Configure Meta webhook verification/HMAC, then send a deliberate sandbox message.
9. Verify `/api/health`, queue depth, storage signed read, audit writes and alert delivery.

## Recovery drills

- Database: monthly automated staging restore; quarterly manual RTO drill. Target RPO ≤24h and documented restore ≤4h.
- Gmail: resume from persisted history cursor. If Gmail reports an invalid cursor, bounded backfill by date and provider-message/RFC-ID/hash dedupe.
- WhatsApp: preserve receipts and replay only unprocessed provider IDs; manual capture is always available.
- Storage: do not mutate file-version keys. Restore quarantined objects within their restore window; validate checksum before making reads available.
- Worker: inspect `failed_jobs` and `job_attempts`; fix the cause, then create a new idempotent run referencing the failed job. Never edit append-only attempt history.
- Archive: retry from the manifest. Do not close deletion/retention work until the destination checksum and approved-version manifest agree.

## Credential rotation

Rotate one provider at a time, keep old and new credentials overlapping briefly, run its health check, then revoke the old credential. Record actor, timestamp, provider account and verification outcome in the operator log; never place secret values in tickets or logs.
