# Acceptance execution

> **Current result (04 August 2026): not accepted.** The new production-mode browser suite executes the surfaces described below, but 56 checks fail and the twelve PRD scenarios do not complete. See [`e2e-audit-2026-08-04.md`](./e2e-audit-2026-08-04.md).

The release suite maps back to `docs/traceability/prd-matrix.md`. CI blocks any requirement marked implemented without an automated or explicitly manual test reference.

## Automated layers

- Domain unit tests: RBAC, temporary expiry, state transitions, manager gates, workflow migration, version approval, GST and workload calculations.
- Database integration: relationship/partial-unique checks, append-only triggers, file/share pinning, final-manager protection and organization isolation.
- Adapter contracts: Gmail reconciliation/dedupe, WhatsApp signature/order, storage finalize/retry, disabled-AI/manual fallback and PGMQ visibility/retry.
- Browser E2E: the twelve PRD scenarios on 375, 768, 1024 and 1440 viewports.

## Mandatory manual gates

Keyboard and screen-reader pass; reduced-motion pass; all four review formats on mobile; real Workspace/Meta sandbox recovery; production-like backup restore; legal review of quotation/GST wording; manager UAT; and account-ownership audit.

## Performance budgets

p95 non-provider API under 750ms, interaction response under 100ms, virtualized long lists, no core-work WebGL, bounded media workers, and no public-review asset URL with a lifetime longer than its share policy.
