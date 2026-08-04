# Infrastructure

Terraform provisions Mumbai-region Cloud Run services, Artifact Registry, Pub/Sub, IAM, Secret Manager access, alerting, and scheduled Gmail-watch renewal. Supabase remains separately managed because project creation, billing ownership, and production organization transfer require AndThenn approval.

Never place production credentials in Terraform state or repository files. Secret values are created out-of-band and referenced from Secret Manager.
