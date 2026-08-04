# ADR 0001: Modular TypeScript monorepo

## Status

Accepted.

## Decision

Use a pnpm/Turborepo workspace with separately deployable Next.js web and Node.js worker applications. Domain rules, contracts, persistence, provider adapters, and UI primitives live in isolated packages. Core domain code cannot import provider implementations or framework route modules.

## Consequences

- Provider changes do not alter core project, file-version, review, or workflow entities.
- Domain rules can be tested without Next.js, Supabase, Google, or Meta credentials.
- Web and worker releases use the same contracts while retaining independent scaling and rollback.
