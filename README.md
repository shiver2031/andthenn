# AndThenn Media ERP

Production-oriented media operations software built from `AndThenn_Media_ERP_PRD_v1.0.docx`. It combines source-preserving intake, proposals and activation, project-defined workflows, immutable media versions, public review, workload planning, operational quoting, closure, audit, and provider recovery in one monorepo.

## Architecture

- `apps/web` — Next.js App Router ERP, review portal, server actions and webhooks.
- `apps/worker` — continuously available PGMQ consumers with visibility timeouts, exponential backoff and a failed-job queue.
- `packages/domain` — framework-free business rules, authorization and state machines.
- `packages/db` — 59-table Drizzle/PostgreSQL schema, generated migrations, invariant triggers and demo seed.
- `packages/contracts` — versionable Zod command and webhook schemas.
- `packages/adapters` — Supabase S3, Gmail, Meta WhatsApp, Google AI and PGMQ boundaries.
- `packages/ui` — accessible, token-driven shared primitives.
- `infra` — Cloud Run Mumbai, IAM, Pub/Sub, Secret Manager and monitoring in Terraform.

See [architecture](docs/architecture/README.md), [PRD traceability](docs/traceability/prd-matrix.md), and [production handover](docs/runbooks/production-handover.md).

## Local development

Requirements: Node 22+, pnpm 10+, PostgreSQL 15+ with `pgmq` and `pg_trgm`, and a Supabase project for end-to-end provider testing.

```bash
cp .env.example .env.local
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Without provider/database variables, the web application boots in an explicit local showcase mode. Production fails closed when Auth, review-token pepper, or storage configuration is absent; showcase responses are never enabled under `NODE_ENV=production`.

## Quality gates

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

Database changes must be expressed in `packages/db/src/schema.ts`, generated with `pnpm db:generate`, then supplemented only by an ordered custom migration when PostgreSQL triggers or extensions are required.

## Provider activation

AI suggestions default off. Enable OCR, transcription, and Gemini independently only after the related GCP processors, regional policy and data-processing approval are recorded. WhatsApp manual fallback remains available even after Meta activation. Gmail watch renewal and reconciliation are worker-owned operational jobs, not optional webhook enhancements.
