# Architecture overview

```text
Forwarded Gmail ─┐
WhatsApp Cloud ──┼─> verified webhook receipts ─> intake normalization ─┐
Manual capture ──┘                                                       │
                                                                         v
Supabase Auth ─> Next.js web ─> domain commands ─> PostgreSQL + audit + outbox
                         │                           │
                         │                           v
Public review token ─────┘                       PGMQ queues
                                                     │
                                                     v
                                  internal Cloud Run worker
                                  ├─ Gmail / WhatsApp sends
                                  ├─ Document AI / Vertex AI
                                  ├─ media derivatives
                                  └─ archive / retention / notifications
```

The application is a single organization-aware product with server-side authorization. Supabase Auth proves identity; application memberships and assignments decide access. Provider adapters normalize external payloads and never leak provider-specific identifiers into core domain entities.
