# PRD-CR-002 — CRM accountability, Client decisions and operational finance

Status: implementation direction explicitly authorized by the user on 5 September 2026. Named organization approval and production role mapping remain release gates; this document is not a fabricated sign-off.

Source precedence: CRM Flow.docx provides functional direction. The original ERP PRD remains authoritative where it does not conflict. The user-approved completion plan resolves these conflicts:

| Original requirement | Accepted change | Consequence and evidence |
|---|---|---|
| FR-RVW-011 / BR-012: feedback-only Client portal | Authenticated, currently granted Clients may approve the exact internally cleared version. Guest links remain feedback-only. | Portal decision stores Client identity and time; golden portal and isolation scenarios. |
| FR-RVW-012, FR-WFL-007 / BR-013: approval/completion coupling | Internal clearance, Client approval, explicit final delivery and independently confirmed completion are separate records/actions. | current_final_files is the shared final predicate; legacy approvals never become finals automatically. |
| FR-FIN-006: no expenses or profitability | Founder-led operational expenses and paid-revenue-minus-expenses summaries; explicitly granted Managers only. | No bookkeeping/payroll/tax filing extension. PARTIAL invoice totals are separate; no invented received amount or cross-currency sum. Finance definitions require owner sign-off. |
| Task scope and role permissions | Every active internal role may create/assign tasks in accessible projects and real outputs. | No standalone task records. Existing organization/resource boundaries remain. |
| Self-assigned completion | Independent eligible reviewer confirms; leader fallback/designation requires a reason. | Self-confirmation is prohibited. Ordinary edits preserve assigner and assignment date. |
| Final publication | Owner or authorized leader explicitly publishes a Client-approved ready version. | No automatic email/WhatsApp; reopening withdraws current eligibility and preserves historical bytes. |

Migration: append 0013 after 0012, preserve assignment and approval history, classify undocumented historical approval as LEGACY_UNVERIFIED and expose approval_reconciliation_queue. Reconcile only from attributable historical evidence; otherwise obtain a fresh decision and publication. Never synthesize Client identity, approval time, or historical delivery.

Release acceptance: traceability register, complete positive/negative browser journeys, exact-release staging evidence, all 14 external approval records, and protected release gate. Production clean start remains the default subject to role-mapping approval. Destructive retention remains disabled until approved and recovery-tested.
