# Threat model

## Protected assets

Client briefs, raw messages, media originals and proxies, commercial values, reviewer identity, credentials, audit history, and project membership are confidential. Immutable lineage, approvals and audit records also require integrity protection.

## Trust boundaries and controls

| Boundary | Principal risks | Required controls |
|---|---|---|
| Browser → ERP | IDOR, role escalation, CSRF, stale updates | Supabase session verification, database membership policy on every command, optimistic versions, same-site cookies, Zod validation |
| Public review | leaked or guessed token, cross-version access, spam | 256-bit token generated once, peppered SHA-256 only at rest, pinned `file_version_id`, expiry/revocation, short signed reads, rate limits, reviewer session |
| Gmail Pub/Sub | forged push, replay, dropped notification | Google OIDC audience/expiry validation, unique receipt, history cursor, daily renewal, reconciliation and message/hash dedupe |
| Meta webhook | forged payload, replay, unordered media | constant-time HMAC validation over raw bytes, provider message ID uniqueness, normalized ordering, asynchronous media fetch |
| Upload | MIME spoof, truncation, object substitution | task authorization before signing, bounded size, immutable ID-based key, expected length and SHA-256 metadata, server finalization, async media inspection |
| Worker | duplicate execution, poison job, data exfiltration | idempotency key, visibility timeout, bounded retry/backoff, failed queue, least-privilege service account, structured redaction |
| Database | cross-organization access, history mutation | organization key on operational rows, scoped repositories, constraints, append-only triggers, PITR/backups |
| AI providers | residency and prompt leakage | feature flags off by default, least-content input, source display, editable outputs, usage metering, manual fallback |

## Abuse cases tested before release

Direct access to another project or task, temporary-user search enumeration, collaborator status transition, manager override without reason, final-manager removal, expired review link, review-version substitution, webhook replay, malicious MIME declaration, duplicate conversion, audit mutation, and archive deletion before retention must all fail server-side.
