# PRD traceability matrix

> **Audit note (04 August 2026):** this file records claimed code/schema presence, not working or accepted behavior. The production-mode E2E and browser audit found 56 automated failures and 0/12 passing critical PRD scenarios. Use [`prd-gap-analysis-2026-08-04.md`](./prd-gap-analysis-2026-08-04.md) for the verified current-state comparison.

The authoritative baseline is `AndThenn_Media_ERP_PRD_v1.0.docx`. `Implemented` means the code/schema/route exists; `verified` additionally requires its automated gate; `accepted` requires credential-backed staging and manager UAT.

| Requirement group | IDs | Primary implementation | Verification | Status |
|---|---|---|---|---|
| Identity and access | FR-IAM-001–007 | memberships, authorization policy, Supabase session boundary | role/expiry unit tests; credential-backed role matrix pending | implemented |
| Clients and rate cards | FR-CLT-001–005 | client, brand, contact, effective rate schema and UI | migration and repository integration pending | implemented |
| Intake | FR-INT-001–010 | intake schema, verified Gmail/WhatsApp endpoints, manual contracts, claim UI | provider sandbox reconciliation pending | implemented |
| Proposals | FR-PRP-001–005 | proposal state machine and activation handoff | transition tests | implemented |
| Projects | FR-PRJ-001–007 | project service and workspace routes | activation/reopen tests | implemented |
| Deliverables | FR-DLV-001–005 | deliverable rollup and confirmation policy | completion tests | implemented |
| Tasks | FR-TSK-001–009 | task schema, assignments, dependency policy | ownership and override tests | implemented |
| Workflow | FR-WFL-001–007 | workflow stages and task transition state machine | migration/feedback tests | implemented |
| Time and workload | FR-TME-001–008 | time/capacity schema and metrics | calculation tests | implemented |
| Files and storage | FR-FIL-001–009 | immutable version ledger and StorageProvider | adapter and immutability tests | implemented |
| Client review | FR-RVW-001–014 | version-pinned shares, annotations, public token route and review UI | responsive visual pass complete; four-format provider fixtures pending | implemented |
| Commercials | FR-FIN-001–006 | quote versions, GST calculations, invoice status | calculation/history tests | implemented |
| Operations | FR-OPS-001–009 | dashboards, search, notifications, audit, outbox and worker health | worker retry unit test; production observability drill pending | implemented |

The twenty `BR-001`–`BR-020` rules are represented across `packages/domain` and database constraints. The twelve release scenarios are catalogued in `docs/testing/acceptance.md`; credential-backed end-to-end execution remains a production-like staging and manager-UAT gate and is not marked accepted here.
