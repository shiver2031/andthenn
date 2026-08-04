resource "google_project_service" "services" {
  for_each = toset(["run.googleapis.com", "artifactregistry.googleapis.com", "pubsub.googleapis.com", "secretmanager.googleapis.com", "monitoring.googleapis.com"])
  service = each.value
  disable_on_destroy = false
}

resource "google_service_account" "runtime" { account_id = "andthenn-runtime"; display_name = "AndThenn ERP runtime" }

resource "google_secret_manager_secret" "runtime" {
  for_each = var.secret_ids
  secret_id = each.value
  replication { auto {} }
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = var.secret_ids
  secret_id = google_secret_manager_secret.runtime[each.key].id
  role = "roles/secretmanager.secretAccessor"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

locals {
  common_env = { NEXT_PUBLIC_SUPABASE_URL = var.supabase_url, NEXT_PUBLIC_SUPABASE_ANON_KEY = var.supabase_anon_key, ORGANIZATION_ID = var.organization_id, OTEL_SERVICE_NAMESPACE = "andthenn" }
}

resource "google_cloud_run_v2_service" "web" {
  name = "andthenn-web"; location = var.region
  deletion_protection = true
  template {
    service_account = google_service_account.runtime.email
    scaling { min_instance_count = 1; max_instance_count = 20 }
    containers {
      image = var.web_image
      resources { limits = { cpu = "2", memory = "1Gi" }; cpu_idle = true }
      ports { container_port = 8080 }
      dynamic "env" { for_each = local.common_env; content { name = env.key; value = env.value } }
      env { name = "DATABASE_URL"; value_source { secret_key_ref { secret = google_secret_manager_secret.runtime["database-url"].secret_id; version = "latest" } } }
      env { name = "REVIEW_TOKEN_PEPPER"; value_source { secret_key_ref { secret = google_secret_manager_secret.runtime["review-token-pepper"].secret_id; version = "latest" } } }
      startup_probe { http_get { path = "/api/health" }; initial_delay_seconds = 5; timeout_seconds = 3; failure_threshold = 10 }
      liveness_probe { http_get { path = "/api/health" }; period_seconds = 30; timeout_seconds = 3 }
    }
  }
  depends_on = [google_project_service.services]
}

resource "google_cloud_run_v2_service" "worker" {
  name = "andthenn-worker"; location = var.region; ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = true
  template {
    service_account = google_service_account.runtime.email
    scaling { min_instance_count = 1; max_instance_count = 4 }
    containers {
      image = var.worker_image
      resources { limits = { cpu = "2", memory = "2Gi" }; cpu_idle = false }
      env { name = "DATABASE_URL"; value_source { secret_key_ref { secret = google_secret_manager_secret.runtime["database-url"].secret_id; version = "latest" } } }
    }
  }
  depends_on = [google_project_service.services]
}

resource "google_cloud_run_v2_service_iam_member" "public_web" { location = var.region; name = google_cloud_run_v2_service.web.name; role = "roles/run.invoker"; member = "allUsers" }
resource "google_pubsub_topic" "gmail" { name = "andthenn-gmail-push" }
resource "google_cloud_run_domain_mapping" "web" { location = var.region; name = var.domain; metadata { namespace = var.project_id }; spec { route_name = google_cloud_run_v2_service.web.name } }

resource "google_monitoring_alert_policy" "web_5xx" {
  display_name = "AndThenn web 5xx rate"
  combiner = "OR"
  conditions { display_name = "5xx responses"; condition_threshold { filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\""; comparison = "COMPARISON_GT"; threshold_value = 5; duration = "300s"; aggregations { alignment_period = "300s"; per_series_aligner = "ALIGN_RATE" } } }
}
