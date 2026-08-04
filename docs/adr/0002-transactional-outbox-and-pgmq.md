# ADR 0002: Transactional outbox and durable queue

## Status

Accepted.

## Decision

Material commands write domain state, append-only audit data, and an outbox event in one PostgreSQL transaction. A dispatcher places work on PGMQ; consumers remain idempotent and record job attempts, retry timing, failure reasons, and recovery actions.

## Consequences

- No state transition depends on a best-effort network call.
- Email, WhatsApp, AI, media processing, notification, and archive outages degrade to visible retryable jobs.
- Provider webhooks are persisted and deduplicated before domain processing.
