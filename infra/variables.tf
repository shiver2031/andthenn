variable "project_id" { type = string }
variable "region" { type = string; default = "asia-south1" }
variable "web_image" { type = string }
variable "worker_image" { type = string }
variable "domain" { type = string }
variable "supabase_url" { type = string }
variable "supabase_anon_key" { type = string; sensitive = true }
variable "organization_id" { type = string }
variable "secret_ids" { type = set(string); default = ["database-url", "review-token-pepper", "whatsapp-app-secret", "whatsapp-access-token"] }
