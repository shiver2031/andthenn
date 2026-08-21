resource "google_project_service" "services" {
  for_each           = toset(["run.googleapis.com", "artifactregistry.googleapis.com", "pubsub.googleapis.com", "secretmanager.googleapis.com", "monitoring.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "andthenn"
  description   = "AndThenn ERP runtime images"
  format        = "DOCKER"

  depends_on = [google_project_service.services]
}

resource "google_service_account" "runtime" {
  account_id   = "andthenn-runtime"
  display_name = "AndThenn ERP runtime"
}

resource "google_service_account" "gmail_push" {
  account_id   = "andthenn-gmail-push"
  display_name = "AndThenn Gmail Pub/Sub push"
}

resource "google_secret_manager_secret" "runtime" {
  for_each  = var.secret_ids
  secret_id = each.value

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = var.secret_ids
  secret_id = google_secret_manager_secret.runtime[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

locals {
  common_env = {
    APP_URL                             = var.app_url
    NEXT_PUBLIC_SUPABASE_URL            = var.supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY       = var.supabase_anon_key
    ORGANIZATION_ID                     = var.organization_id
    GOOGLE_PUBSUB_VERIFICATION_AUDIENCE = var.gmail_pubsub_audience
    GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL = google_service_account.gmail_push.email
    OTEL_SERVICE_NAMESPACE              = "andthenn"
  }

  web_secrets = {
    DATABASE_URL                  = "database-url"
    SUPABASE_SERVICE_ROLE_KEY     = "supabase-service-role-key"
    SUPABASE_S3_ENDPOINT          = "supabase-s3-endpoint"
    SUPABASE_S3_ACCESS_KEY_ID     = "supabase-s3-access-key-id"
    SUPABASE_S3_SECRET_ACCESS_KEY = "supabase-s3-secret-access-key"
    SUPABASE_STORAGE_BUCKET       = "supabase-storage-bucket"
    REVIEW_TOKEN_PEPPER           = "review-token-pepper"
    META_WHATSAPP_APP_SECRET      = "whatsapp-app-secret"
    META_WHATSAPP_VERIFY_TOKEN    = "whatsapp-verify-token"
    META_WHATSAPP_PHONE_NUMBER_ID = "whatsapp-phone-number-id"
    META_WHATSAPP_ACCESS_TOKEN    = "whatsapp-access-token"
  }

  worker_secrets = merge(local.web_secrets, {
    GOOGLE_SERVICE_ACCOUNT_JSON   = "google-service-account-json"
    GOOGLE_PUBSUB_TOPIC           = "google-pubsub-topic"
    GOOGLE_WORKSPACE_INTAKE_EMAIL = "google-workspace-intake-email"
    MEDIA_INSPECTION_URL          = "media-inspection-url"
    MEDIA_INSPECTION_TOKEN        = "media-inspection-token"
  })
}

resource "google_cloud_run_v2_service" "web" {
  name                = "andthenn-web"
  location            = var.region
  deletion_protection = true

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = 1
      max_instance_count = 20
    }

    containers {
      image = var.web_image

      resources {
        limits   = { cpu = "2", memory = "1Gi" }
        cpu_idle = true
      }

      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = local.common_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.web_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get { path = "/api/health/ready" }
        initial_delay_seconds = 5
        timeout_seconds       = 3
        failure_threshold     = 10
      }

      liveness_probe {
        http_get { path = "/api/health/live" }
        period_seconds  = 30
        timeout_seconds = 3
      }
    }
  }

  depends_on = [google_project_service.services]
}

resource "google_cloud_run_v2_service" "worker" {
  name                = "andthenn-worker"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = true

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = 1
      max_instance_count = 4
    }

    containers {
      image = var.worker_image

      resources {
        limits   = { cpu = "2", memory = "2Gi" }
        cpu_idle = false
      }

      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = local.common_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.worker_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get { path = "/health/ready" }
        initial_delay_seconds = 5
        timeout_seconds       = 3
        failure_threshold     = 10
      }

      liveness_probe {
        http_get { path = "/health/live" }
        period_seconds  = 30
        timeout_seconds = 3
      }
    }
  }

  depends_on = [google_project_service.services]
}

resource "google_cloud_run_v2_service_iam_member" "public_web" {
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "gmail_push" {
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.gmail_push.email}"
}

resource "google_pubsub_topic" "gmail" {
  name = "andthenn-gmail-push"
}

resource "google_pubsub_subscription" "gmail_to_web" {
  name  = "andthenn-gmail-to-web"
  topic = google_pubsub_topic.gmail.id

  push_config {
    push_endpoint = "${var.app_url}/api/webhooks/gmail"

    oidc_token {
      service_account_email = google_service_account.gmail_push.email
      audience              = var.gmail_pubsub_audience
    }
  }

  depends_on = [google_cloud_run_v2_service_iam_member.gmail_push]
}

resource "google_cloud_run_domain_mapping" "web" {
  location = var.region
  name     = var.domain

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.web.name
  }
}

resource "google_monitoring_alert_policy" "web_5xx" {
  display_name = "AndThenn web 5xx rate"
  combiner     = "OR"

  conditions {
    display_name = "5xx responses"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }
}
