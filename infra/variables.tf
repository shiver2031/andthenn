variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "asia-south1"
}

variable "web_image" {
  type = string
}

variable "worker_image" {
  type = string
}

variable "domain" {
  type = string
}

variable "app_url" {
  type = string

  validation {
    condition     = can(regex("^https://[^/]+$", var.app_url))
    error_message = "app_url must be an HTTPS origin with no path."
  }
}

variable "supabase_url" {
  type = string
}

variable "supabase_anon_key" {
  type      = string
  sensitive = true
}

variable "organization_id" {
  type = string
}

variable "gmail_pubsub_audience" {
  type = string
}

variable "secret_ids" {
  type = set(string)
  default = [
    "database-url",
    "supabase-service-role-key",
    "supabase-s3-endpoint",
    "supabase-s3-access-key-id",
    "supabase-s3-secret-access-key",
    "supabase-storage-bucket",
    "review-token-pepper",
    "whatsapp-app-secret",
    "whatsapp-verify-token",
    "whatsapp-phone-number-id",
    "whatsapp-access-token",
    "google-service-account-json",
    "google-pubsub-topic",
    "google-workspace-intake-email",
    "media-inspection-url",
    "media-inspection-token",
  ]
}
